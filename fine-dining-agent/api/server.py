import logging
import os
import hmac
import tempfile
import threading
import time
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

from api.session_manager import SessionManager
from core.intent_radar import evaluate_signal, goal_from_hypothesis
from core.llm_provider import RateLimitError
from inputs.restaurant_finder import fetch_online_menu_text, find_nearby_restaurants
from memory.store import UserMemory


load_dotenv(".env")

CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN")
DEFAULT_CORS_ORIGINS = [
    "https://agmentic.com",
    "http://localhost:9000",
    "http://localhost:8000",
]
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
] or DEFAULT_CORS_ORIGINS
SHOWCASE_SHEETS_SECRET = os.getenv("SHOWCASE_SHEETS_SECRET", "")
SHOWCASE_SHEET_ID = os.getenv("SHOWCASE_SHEET_ID", "12TkQMg3G53h0g9iKwXrY4qDp5zl_wThH3BVMmEq1oVE")
GOOGLE_SERVICE_ACCOUNT_FILE = os.getenv(
    "GOOGLE_SERVICE_ACCOUNT_FILE",
    "/home/agmentic/contact-collector-foodkeys/google-service-account.json",
)

if not CLOUDFLARE_ACCOUNT_ID or not CLOUDFLARE_API_TOKEN:
    raise RuntimeError("Missing Cloudflare credentials. Check your .env file.")

app = FastAPI(title="Fine Dining Agent API")
manager = SessionManager(
    account_id=CLOUDFLARE_ACCOUNT_ID,
    api_token=CLOUDFLARE_API_TOKEN,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    session_id: str
    message: str


class SuggestRequest(BaseModel):
    session_id: str
    occasion: str
    num_courses: int


class MenuTextRequest(BaseModel):
    session_id: str
    text: str


class StructuredMenuRequest(BaseModel):
    session_id: str
    menu: dict


class LocationRequest(BaseModel):
    session_id: str
    latitude: float
    longitude: float
    accuracy: float | None = None


class RestaurantMenuRequest(BaseModel):
    session_id: str
    restaurant: dict


class RetailerNegotiationRequest(BaseModel):
    session_id: str
    message: str
    retailer_policy: dict | None = None


class RadarRequest(BaseModel):
    session_id: str
    source: str
    signal: dict


class RadarConfirmRequest(BaseModel):
    session_id: str
    hypothesis: dict
    signal: dict


DEMO_QUESTION_LIMIT = 2
DEMO_HANDSHAKE_LIMIT = 2
DEMO_SESSION_TTL_SECONDS = 6 * 60 * 60
DEMO_SESSIONS_PER_IP = 10
DEMO_MENU = {
    "restaurant_type": "fine dining restaurant",
    "language": "English",
    "items": [
        {"section": "Starter", "name": "Burrata", "description": "smoked tomato, basil oil, toasted sourdough", "price": "€16"},
        {"section": "Starter", "name": "Beetroot carpaccio", "description": "horseradish cream, hazelnut, dill", "price": "€14"},
        {"section": "Main", "name": "Sea bass", "description": "saffron beurre blanc, fennel", "price": "€34"},
        {"section": "Main", "name": "Wild mushroom risotto", "description": "parmesan foam, chanterelle", "price": "€29"},
        {"section": "Main", "name": "Wagyu beef cheek", "description": "celeriac puree, bordelaise", "price": "€42"},
        {"section": "Dessert", "name": "Chocolate souffle", "description": "vanilla ice cream, cacao nib", "price": "€13"},
        {"section": "Wine", "name": "Riesling Kabinett", "description": "Mosel, citrus, slate", "price": "€12"},
        {"section": "Zero-proof", "name": "Yuzu tonic", "description": "yuzu, rosemary, tonic water", "price": "€10"},
    ],
}
demo_sessions: dict[str, dict] = {}
demo_ip_sessions: dict[str, list[float]] = {}
demo_lock = threading.Lock()


class DemoConfigureRequest(BaseModel):
    token: str
    party_size: int = 2
    budget_per_person: float = 35
    likes: list[str] = Field(default_factory=list)
    dislikes: list[str] = Field(default_factory=list)
    occasion: str = "dinner"
    menu: dict | None = None


class DemoChatRequest(BaseModel):
    token: str
    message: str


class DemoHandshakeRequest(BaseModel):
    token: str


class DemoLocationRequest(BaseModel):
    token: str
    latitude: float
    longitude: float
    accuracy: float | None = None


class ShowcaseLeadRequest(BaseModel):
    lead_id: str
    email: str
    verified_at: str
    source: str
    category: str
    campaign_id: str
    country: str = ""
    duplicate_count: int = 0
    sheet_status: str = "synced"
    last_error: str = ""


def _append_showcase_lead_to_sheet(lead: ShowcaseLeadRequest) -> None:
    credentials = service_account.Credentials.from_service_account_file(
        GOOGLE_SERVICE_ACCOUNT_FILE,
        scopes=["https://www.googleapis.com/auth/spreadsheets"],
    )
    session = AuthorizedSession(credentials)
    existing_url = (
        f"https://sheets.googleapis.com/v4/spreadsheets/{SHOWCASE_SHEET_ID}/values/"
        "'Showcase Leads'!A2:A10000"
    )
    existing_response = session.get(existing_url, timeout=15)
    if not existing_response.ok:
        raise RuntimeError(
            f"google_sheets_read_failed_{existing_response.status_code}_{existing_response.text[:200]}"
        )
    existing_ids = {
        str(row[0]) for row in existing_response.json().get("values", []) if row
    }
    if lead.lead_id in existing_ids:
        return
    range_name = "'Showcase Leads'!A:J"
    url = (
        f"https://sheets.googleapis.com/v4/spreadsheets/{SHOWCASE_SHEET_ID}/values/"
        f"{range_name}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS"
    )
    response = session.post(
        url,
        json={"values": [[
            lead.lead_id, lead.email, lead.verified_at, lead.source, lead.category,
            lead.campaign_id, lead.country, lead.duplicate_count, lead.sheet_status, lead.last_error,
        ]]},
        timeout=15,
    )
    if not response.ok:
        raise RuntimeError(f"google_sheets_append_failed_{response.status_code}_{response.text[:200]}")


@app.post("/internal/showcase-lead")
def append_showcase_lead(request: Request, lead: ShowcaseLeadRequest) -> dict:
    supplied = request.headers.get("x-agmentic-internal", "")
    if not SHOWCASE_SHEETS_SECRET or not hmac.compare_digest(supplied, SHOWCASE_SHEETS_SECRET):
        raise HTTPException(403, "Forbidden")
    try:
        _append_showcase_lead_to_sheet(lead)
    except Exception as error:
        logging.exception("Showcase Google Sheet append failed")
        raise HTTPException(502, "Google Sheet append failed") from error
    return {"ok": True}


def _demo_client_ip(request: Request) -> str:
    return (
        request.headers.get("cf-connecting-ip")
        or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )


def _cleanup_demo_sessions(now: float) -> None:
    expired = [token for token, value in demo_sessions.items() if now - value["created_at"] > DEMO_SESSION_TTL_SECONDS]
    for token in expired:
        session_id = demo_sessions[token]["session_id"]
        agent = manager.sessions.pop(session_id, None)
        manager.last_used.pop(session_id, None)
        if agent and os.path.exists(agent.memory.file_path):
            try:
                os.remove(agent.memory.file_path)
            except OSError:
                pass
        demo_sessions.pop(token, None)


def _get_demo_session(token: str) -> dict:
    now = time.time()
    with demo_lock:
        _cleanup_demo_sessions(now)
        session = demo_sessions.get(token)
        if not session:
            raise HTTPException(401, "Demo session is invalid or expired")
        return session


def _demo_quota(session: dict) -> dict:
    return {
        "remaining_questions": max(0, DEMO_QUESTION_LIMIT - session["questions_used"]),
        "remaining_handshakes": max(0, DEMO_HANDSHAKE_LIMIT - session["handshakes_used"]),
        "location_available": not session["location_used"],
    }


@app.post("/demo/session")
def create_demo_session(request: Request) -> dict:
    now = time.time()
    client_ip = _demo_client_ip(request)
    with demo_lock:
        _cleanup_demo_sessions(now)
        recent = [stamp for stamp in demo_ip_sessions.get(client_ip, []) if now - stamp < DEMO_SESSION_TTL_SECONDS]
        if len(recent) >= DEMO_SESSIONS_PER_IP:
            raise HTTPException(429, "Demo session limit reached for this network")
        recent.append(now)
        demo_ip_sessions[client_ip] = recent
        token = uuid.uuid4().hex
        session_id = f"showcase_{uuid.uuid4().hex}"
        demo_sessions[token] = {
            "session_id": session_id,
            "created_at": now,
            "questions_used": 0,
            "handshakes_used": 0,
            "location_used": False,
            "config": {"party_size": 2, "budget_per_person": 35, "likes": [], "dislikes": [], "occasion": "dinner"},
            "menu": DEMO_MENU,
        }
    manager.get_agent(session_id).load_structured_menu({**DEMO_MENU, "items": [dict(item) for item in DEMO_MENU["items"]]})
    return {"token": token, "menu": DEMO_MENU, "quota": _demo_quota(demo_sessions[token]), "expires_in": DEMO_SESSION_TTL_SECONDS}


@app.post("/demo/configure")
def configure_demo(request: DemoConfigureRequest) -> dict:
    session = _get_demo_session(request.token)
    if not 1 <= request.party_size <= 6 or not 10 <= request.budget_per_person <= 80:
        raise HTTPException(400, "Party size or budget is outside the showcase range")
    menu = request.menu or DEMO_MENU
    if len(menu.get("items", [])) != len(DEMO_MENU["items"]):
        raise HTTPException(400, "The showcase menu structure cannot be changed")
    allowed_names = {item["name"] for item in DEMO_MENU["items"]}
    for item in menu.get("items", []):
        if item.get("name") not in allowed_names:
            raise HTTPException(400, "Only showcase menu items are allowed")
        price = _demo_price(item.get("price"))
        if price is None or not 4 <= price <= 60:
            raise HTTPException(400, "Menu prices must stay between €4 and €60")
    session["config"] = {
        "party_size": request.party_size,
        "budget_per_person": request.budget_per_person,
        "likes": request.likes[:4],
        "dislikes": request.dislikes[:4],
        "occasion": request.occasion[:80],
    }
    session["menu"] = menu
    agent = manager.get_agent(session["session_id"])
    agent.load_structured_menu(menu)
    for value in request.likes[:4]:
        agent.memory.add_liked(value, "showcase preference")
    for value in request.dislikes[:4]:
        agent.memory.add_disliked(value, "showcase preference")
    return {"status": "configured", "quota": _demo_quota(session)}


@app.post("/demo/chat")
def demo_chat(request: DemoChatRequest) -> dict:
    session = _get_demo_session(request.token)
    message = request.message.strip()
    if not 2 <= len(message) <= 280:
        raise HTTPException(400, "Question must be between 2 and 280 characters")
    with demo_lock:
        if session["questions_used"] >= DEMO_QUESTION_LIMIT:
            raise HTTPException(429, "You have used both showcase questions")
        session["questions_used"] += 1
    try:
        agent = manager.get_agent(session["session_id"])
        agent.history.append({"role": "user", "content": message})
        response = agent._chat_with_fallback(message)
        agent.history.append({"role": "assistant", "content": response})
    except Exception:
        with demo_lock:
            session["questions_used"] = max(0, session["questions_used"] - 1)
        raise
    return {"response": response, "quota": _demo_quota(session)}


@app.post("/demo/location")
def demo_location(request: DemoLocationRequest) -> dict:
    session = _get_demo_session(request.token)
    with demo_lock:
        if session["location_used"]:
            raise HTTPException(429, "Location lookup has already been used in this showcase")
        session["location_used"] = True
    restaurants = find_nearby_restaurants(request.latitude, request.longitude, accuracy_m=request.accuracy)
    return {"restaurants": restaurants[:3], "quota": _demo_quota(session)}


@app.post("/demo/handshake")
def demo_handshake(request: DemoHandshakeRequest) -> dict:
    session = _get_demo_session(request.token)
    with demo_lock:
        if session["handshakes_used"] >= DEMO_HANDSHAKE_LIMIT:
            raise HTTPException(429, "You have used both showcase handshakes")
        session["handshakes_used"] += 1
    config = session["config"]
    candidates = []
    dislikes = " ".join(config["dislikes"]).lower()
    likes = " ".join(config["likes"]).lower()
    for item in session["menu"]["items"]:
        source = f'{item.get("name", "")} {item.get("description", "")} {item.get("section", "")}'.lower()
        if dislikes and any(term.strip() and term.strip() in source for term in dislikes.split(",")):
            continue
        base = _demo_price(item.get("price"))
        if base is None:
            continue
        offered = round(base * 0.88, 2)
        if offered <= config["budget_per_person"]:
            score = base + (20 if likes and any(term.strip() and term.strip() in source for term in likes.split(",")) else 0)
            if item.get("section", "").lower() == "main":
                score += 8
            candidates.append((score, item, base, offered))
    if not candidates:
        raise HTTPException(409, "No safe offer fits the current budget and dislikes")
    _, item, base, offered = max(candidates, key=lambda value: value[0])
    events = [
        {"speaker": "consumer", "action": "INTENT_BRIEF", "message": f'{config["party_size"]} guests, €{config["budget_per_person"]:.0f} per person, likes {", ".join(config["likes"]) or "not specified"}.'},
        {"speaker": "retailer", "action": "MENU_POLICY", "message": f'{len(session["menu"]["items"])} menu items received; up to 12% showcase concession available.'},
        {"speaker": "retailer", "action": "OFFER_PROPOSAL", "message": f'{item["name"]} proposed at €{offered:.2f}, down from €{base:.2f}.'},
        {"speaker": "consumer", "action": "VERIFY_CONSTRAINTS", "message": "Budget and preference constraints pass; venue availability remains simulated."},
        {"speaker": "system", "action": "READY_FOR_CONFIRMATION", "message": "The offer is ready for user review. No booking or payment was made."},
    ]
    return {"offer": {"item": item, "list_price": base, "offer_price": offered, "party_size": config["party_size"], "budget_per_person": config["budget_per_person"], "promotion": "12% showcase concession"}, "events": events, "quota": _demo_quota(session)}


def _demo_price(value) -> float | None:
    import re
    match = re.search(r"(\d+(?:[,.]\d{1,2})?)", str(value or ""))
    return float(match.group(1).replace(",", ".")) if match else None


@app.post("/chat")
def chat(request: ChatRequest) -> dict:
    agent = manager.get_agent(request.session_id)

    try:
        return {"response": agent.chat(request.message)}
    except RateLimitError as error:
        raise HTTPException(429, "Rate limit reached") from error
    except Exception:
        logging.exception("Chat request failed")
        raise


@app.post("/menu")
async def menu(session_id: str = Form(...), image: UploadFile = File(...)) -> dict:
    agent = manager.get_agent(session_id)
    suffix = os.path.splitext(image.filename or "")[1]
    temp_file_path = ""

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(await image.read())
            temp_file_path = temp_file.name

        items_count = agent.load_menu(temp_file_path)
        return {
            "items_count": items_count,
            "restaurant_type": agent.current_menu["restaurant_type"],
            "menu": agent.current_menu,
            "restaurant": _restaurant_context({"source": "photo"}),
        }
    except RateLimitError as error:
        raise HTTPException(429, "Rate limit reached") from error
    except Exception:
        logging.exception("Menu request failed")
        raise
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)


@app.post("/menu/text")
def menu_text(request: MenuTextRequest) -> dict:
    agent = manager.get_agent(request.session_id)

    try:
        items_count = agent.load_menu_from_text(request.text)
        return {
            "items_count": items_count,
            "restaurant_type": agent.current_menu["restaurant_type"],
            "menu": agent.current_menu,
            "restaurant": _restaurant_context({"source": "photo"}),
        }
    except RateLimitError as error:
        raise HTTPException(429, "Rate limit reached") from error
    except Exception:
        logging.exception("Menu text request failed")
        raise


@app.post("/menu/structured")
def menu_structured(request: StructuredMenuRequest) -> dict:
    agent = manager.get_agent(request.session_id)

    try:
        items_count = agent.load_structured_menu(request.menu)
        return {
            "items_count": items_count,
            "restaurant_type": agent.current_menu["restaurant_type"],
            "menu": agent.current_menu,
            "restaurant": _restaurant_context({"source": "structured_cache"}),
        }
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except Exception:
        logging.exception("Structured menu request failed")
        raise


@app.post("/location/restaurants")
def location_restaurants(request: LocationRequest) -> dict:
    try:
        return {
            "restaurants": find_nearby_restaurants(
                request.latitude,
                request.longitude,
                accuracy_m=request.accuracy,
            )
        }
    except Exception:
        logging.exception("Restaurant location lookup failed")
        raise


@app.post("/location/menu")
def location_menu(request: RestaurantMenuRequest) -> dict:
    agent = manager.get_agent(request.session_id)

    try:
        online_menu = fetch_online_menu_text(request.restaurant)
        if not online_menu["text"]:
            raise HTTPException(404, "No online menu found for this restaurant")

        items_count = agent.load_menu_from_text(online_menu["text"])
        if items_count == 0:
            logging.warning(
                "Online menu yielded zero items for %s from %s",
                request.restaurant.get("name", "unknown restaurant"),
                online_menu["source_url"],
            )
            raise HTTPException(404, "No readable online menu items found for this restaurant")

        return {
            "items_count": items_count,
            "restaurant_type": agent.current_menu["restaurant_type"],
            "source_url": online_menu["source_url"],
            "menu": agent.current_menu,
            "restaurant": _restaurant_context(
                request.restaurant,
                source_url=online_menu["source_url"],
            ),
        }
    except HTTPException:
        raise
    except RateLimitError as error:
        raise HTTPException(429, "Rate limit reached") from error
    except Exception:
        logging.exception("Online menu request failed")
        raise


@app.post("/suggest")
def suggest(request: SuggestRequest) -> dict:
    agent = manager.get_agent(request.session_id)

    try:
        return agent.build_meal(request.occasion, request.num_courses)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except RateLimitError as error:
        raise HTTPException(429, "Rate limit reached") from error
    except Exception:
        logging.exception("Suggest request failed")
        raise


@app.post("/retailer/negotiate")
def retailer_negotiate(request: RetailerNegotiationRequest) -> dict:
    agent = manager.get_agent(request.session_id)

    try:
        return agent.negotiate_retailer_offer(
            request.message,
            retailer_policy=request.retailer_policy,
        )
    except RateLimitError as error:
        raise HTTPException(429, "Rate limit reached") from error
    except Exception:
        logging.exception("Retailer negotiation request failed")
        raise


@app.get("/dining-request/{session_id}")
def get_dining_request(session_id: str) -> dict:
    agent = manager.get_agent(session_id)
    return {"dining_request": agent.get_dining_request()}


@app.get("/profile/{session_id}")
def get_profile(session_id: str) -> dict:
    agent = manager.get_agent(session_id)
    return agent.memory.get_profile()


@app.post("/radar/evaluate")
def radar_evaluate(request: RadarRequest) -> dict:
    agent = manager.get_agent(request.session_id)
    try:
        result = evaluate_signal(request.source, request.signal, agent.memory.get_profile())
    except ValueError as error:
        raise HTTPException(400, str(error)) from error

    primary = result["primary"]
    agent.memory.add_timeline_event(
        "intent_detected",
        f"Radar detected {primary['label']}",
        source=request.source,
        confidence=primary["confidence"],
        evidence=primary["evidence"],
        signal=request.signal,
    )
    return result


@app.post("/radar/confirm")
def radar_confirm(request: RadarConfirmRequest) -> dict:
    agent = manager.get_agent(request.session_id)
    goal = agent.memory.add_goal(goal_from_hypothesis(request.hypothesis, request.signal))
    event = agent.memory.add_timeline_event(
        "goal_confirmed",
        f"Confirmed goal: {goal['label']}",
        goal_id=goal["id"],
        objective=goal["objective"],
        confidence=goal["confidence"],
        signal=request.signal,
    )
    return {"goal": goal, "timeline_event": event}


@app.get("/timeline/{session_id}")
def get_timeline(session_id: str) -> dict:
    agent = manager.get_agent(session_id)
    return {"timeline": agent.memory.get_timeline()}


@app.get("/goals/{session_id}")
def get_goals(session_id: str) -> dict:
    agent = manager.get_agent(session_id)
    return {"goals": agent.memory.get_goals()}


@app.delete("/profile/{session_id}")
def delete_profile(session_id: str) -> dict:
    agent = manager.get_agent(session_id)

    if os.path.exists(agent.memory.file_path):
        os.remove(agent.memory.file_path)

    agent.memory = UserMemory(session_id=session_id)
    agent.reset_conversation()
    return {"status": "cleared"}


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


def _restaurant_context(restaurant: dict, source_url: str = "") -> dict:
    return {
        "name": restaurant.get("name", ""),
        "address": restaurant.get("address", ""),
        "cuisine": restaurant.get("cuisine", ""),
        "distance_m": restaurant.get("distance_m", ""),
        "website": restaurant.get("website", ""),
        "menu_url": restaurant.get("menu_url", ""),
        "source": restaurant.get("source", "online_menu"),
        "source_url": source_url,
    }


app.mount("/", StaticFiles(directory="web", html=True), name="web")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
