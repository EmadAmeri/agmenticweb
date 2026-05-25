import asyncio
import json
import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


APP_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WORKSPACE_ROOT = os.path.abspath(os.path.join(APP_ROOT, ".."))
FRONTEND_DIR = os.path.join(APP_ROOT, "frontend")

load_dotenv(os.path.join(WORKSPACE_ROOT, "fine_dining_agent", ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

app = FastAPI(title="Agmentic Agent Handshake Platform")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MenuItem(BaseModel):
    section: str = "Menu"
    name: str
    description: str = ""
    price: float | None = None


class Promotion(BaseModel):
    name: str = "Chef welcome pairing"
    type: str = "percentage"
    value: float = 12
    rule: str = "Use when the consumer agent asks for wine pairing."


class RetailerAgentRequest(BaseModel):
    name: str = "Maison Lumiere"
    menu_text: str = ""
    promotions: list[Promotion] = Field(default_factory=list)
    radius_m: int = Field(default=450, ge=10, le=5000)


class ConsumerAgentRequest(BaseModel):
    name: str = "Consumer Dining Agent"
    intent: str = "anniversary dinner for two"
    preferences: list[str] = Field(default_factory=lambda: [
        "quiet table",
        "vegetarian starter",
        "wine pairing",
    ])


class ConnectRequest(BaseModel):
    retailer_agent_id: str
    consumer_agent_id: str
    distance_m: int = Field(default=130, ge=0, le=5000)


@dataclass
class RetailerAgent:
    id: str
    name: str
    menu: list[MenuItem]
    promotions: list[Promotion]
    radius_m: int

    def handshake_payload(self) -> dict[str, Any]:
        return {
            "retailer_agent_id": self.id,
            "menu_items": len(self.menu),
            "offer_policy": [dump_model(promotion) for promotion in self.promotions],
            "radius_m": self.radius_m,
            "capabilities": ["menu_exchange", "promotion_negotiation", "reservation_hold"],
        }

    def propose_offer(self, consumer: "ConsumerAgent") -> dict[str, Any]:
        promotion = self.promotions[0] if self.promotions else Promotion()
        item = choose_menu_hook(self.menu, consumer.preferences, consumer.intent)
        proposed_price = calculate_offer_price(item.price, promotion)
        return {
            "menu_hook": dump_model(item),
            "promotion": dump_model(promotion),
            "proposed_price": proposed_price,
            "message": (
                f"{self.name} offers {item.name}"
                f"{f' at {proposed_price}' if proposed_price is not None else ''}"
                f" using {promotion.name}."
            ),
        }

    def accept_counter(self, counter: dict[str, Any]) -> dict[str, Any]:
        return {
            "accepted": True,
            "reservation_hold_minutes": 10,
            "included_items": counter.get("requested_items", []),
            "terms": ["promotion_applied_once", "arrival_confirmation_required"],
        }


@dataclass
class ConsumerAgent:
    id: str
    name: str
    intent: str
    preferences: list[str]
    received_menu: list[MenuItem] = field(default_factory=list)
    received_offer: dict[str, Any] | None = None

    def receive_menu(self, menu: list[MenuItem]) -> dict[str, Any]:
        self.received_menu = menu
        return {
            "consumer_agent_id": self.id,
            "received_items": len(menu),
            "intent": self.intent,
            "preferences": self.preferences,
        }

    def evaluate_offer(self, offer: dict[str, Any]) -> dict[str, Any]:
        self.received_offer = offer
        requested_item = choose_counter_hook(
            self.received_menu,
            offer.get("menu_hook", {}).get("name", ""),
        )
        return {
            "accepted_offer_context": offer,
            "requested_items": [
                offer.get("menu_hook", {}).get("name", "menu hook"),
                requested_item.name,
            ],
            "required_conditions": ["quiet_table", "clear_allergen_notes", "reservation_hold"],
            "message": (
                f"{self.name} can accept if {requested_item.name} is included "
                "and the quiet table is preserved."
            ),
        }


@dataclass
class ConnectionSession:
    id: str
    retailer: RetailerAgent
    consumer: ConsumerAgent
    distance_m: int
    events: list[dict[str, Any]] = field(default_factory=list)
    completed: bool = False

    def build_events(self) -> list[dict[str, Any]]:
        if self.events:
            return self.events

        if self.distance_m > self.retailer.radius_m:
            raise ValueError("Consumer agent is outside the retailer discovery radius.")

        self.events.append(
            agent_event(
                "handshake",
                "system",
                "proximity_match",
                f"{self.consumer.name} connected with {self.retailer.name}.",
                {
                    "distance_m": self.distance_m,
                    "retailer_agent_id": self.retailer.id,
                    "consumer_agent_id": self.consumer.id,
                },
            )
        )

        self.events.append(
            agent_event(
                "message",
                "retailer",
                "MENU_TRANSFER",
                f"{self.retailer.name} sends its live menu and offer policy.",
                self.retailer.handshake_payload(),
            )
        )

        receipt = self.consumer.receive_menu(self.retailer.menu)
        self.events.append(
            agent_event(
                "message",
                "consumer",
                "MENU_RECEIVED",
                f"{self.consumer.name} receives {receipt['received_items']} menu items and checks them against the consumer intent.",
                receipt,
            )
        )

        offer = self.retailer.propose_offer(self.consumer)
        self.events.append(
            agent_event(
                "message",
                "retailer",
                "OFFER_PROPOSAL",
                offer["message"],
                offer,
            )
        )

        counter = self.consumer.evaluate_offer(offer)
        self.events.append(
            agent_event(
                "message",
                "consumer",
                "COUNTER_REQUEST",
                counter["message"],
                counter,
            )
        )

        accepted = self.retailer.accept_counter(counter)
        self.events.append(
            agent_event(
                "message",
                "retailer",
                "ACCEPT_WITH_TERMS",
                f"{self.retailer.name} accepts the counter request and holds the table for 10 minutes.",
                accepted,
            )
        )

        self.events.append(
            agent_event(
                "summary",
                "system",
                "NEGOTIATION_COMPLETE",
                "Menu exchange and negotiation completed between the two registered agents.",
                {
                    "status": "ready_for_consumer_confirmation",
                    "retailer_agent": self.retailer.name,
                    "consumer_agent": self.consumer.name,
                },
            )
        )
        self.completed = True
        return self.events


RETAILER_AGENTS: dict[str, RetailerAgent] = {}
CONSUMER_AGENTS: dict[str, ConsumerAgent] = {}
CONNECTIONS: dict[str, ConnectionSession] = {}

SAMPLE_MENU = """Snacks | Oyster tartlet | cucumber, finger lime, jalapeno | 9
Starter | Burrata | smoked tomato, basil oil, toasted sourdough | 16
Starter | Beetroot carpaccio | horseradish cream, hazelnut, dill | 14
Main | Sea bass | saffron beurre blanc, fennel, caviar oil | 34
Main | Dry-aged duck | cherry jus, endive, potato millefeuille | 38
Dessert | Chocolate souffle | vanilla ice cream, cacao nib | 13
Wine | Riesling Kabinett | Mosel, citrus, slate | 12"""


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/sample")
def sample() -> dict[str, Any]:
    return {
        "retailer": {
            "name": "Maison Lumiere",
            "menu_text": SAMPLE_MENU,
            "promotions": [
                {
                    "name": "Chef welcome pairing",
                    "type": "percentage",
                    "value": 12,
                    "rule": "Use for parties of 2+ before 19:00 or when the consumer asks for wine pairing.",
                }
            ],
            "radius_m": 450,
        },
        "consumer": {
            "name": "Consumer Dining Agent",
            "intent": "anniversary dinner for two",
            "preferences": ["quiet table", "vegetarian starter", "wine pairing"],
        },
        "distance_m": 130,
    }


@app.post("/api/agents/retailer")
def register_retailer(request: RetailerAgentRequest) -> dict[str, Any]:
    menu = parse_menu(request.menu_text or SAMPLE_MENU)
    if not menu:
        raise HTTPException(status_code=400, detail="Retailer menu cannot be empty.")

    agent = RetailerAgent(
        id=f"retailer-{uuid.uuid4()}",
        name=request.name,
        menu=menu,
        promotions=request.promotions or [Promotion()],
        radius_m=request.radius_m,
    )
    RETAILER_AGENTS[agent.id] = agent
    return serialize_retailer(agent)


@app.post("/api/agents/consumer")
def register_consumer(request: ConsumerAgentRequest) -> dict[str, Any]:
    agent = ConsumerAgent(
        id=f"consumer-{uuid.uuid4()}",
        name=request.name,
        intent=request.intent,
        preferences=request.preferences,
    )
    CONSUMER_AGENTS[agent.id] = agent
    return serialize_consumer(agent)


@app.post("/api/connections")
def connect_agents(request: ConnectRequest) -> dict[str, Any]:
    retailer = RETAILER_AGENTS.get(request.retailer_agent_id)
    consumer = CONSUMER_AGENTS.get(request.consumer_agent_id)
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer agent not found.")
    if not consumer:
        raise HTTPException(status_code=404, detail="Consumer agent not found.")
    if request.distance_m > retailer.radius_m:
        raise HTTPException(status_code=400, detail="Consumer agent is outside the retailer discovery radius.")

    connection = ConnectionSession(
        id=f"connection-{uuid.uuid4()}",
        retailer=retailer,
        consumer=consumer,
        distance_m=request.distance_m,
    )
    CONNECTIONS[connection.id] = connection
    return {
        "connection_id": connection.id,
        "retailer": serialize_retailer(retailer),
        "consumer": serialize_consumer(consumer),
        "distance_m": request.distance_m,
        "status": "connected",
    }


@app.get("/api/connections/{connection_id}/events")
async def stream_connection_events(connection_id: str) -> StreamingResponse:
    connection = CONNECTIONS.get(connection_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found.")

    async def generate():
        try:
            events = connection.build_events()
        except ValueError as error:
            yield f"data: {json.dumps({'type': 'error', 'message': str(error)}, ensure_ascii=False)}\n\n"
            return

        for event in events:
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            await asyncio.sleep(1.15)
        yield f"data: {json.dumps({'type': 'complete'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/api/sessions")
def create_legacy_session(request: dict[str, Any]) -> dict[str, Any]:
    retailer = register_retailer(
        RetailerAgentRequest(
            name=request.get("retailer_name", "Maison Lumiere"),
            menu_text=request.get("menu_text", SAMPLE_MENU),
            promotions=[Promotion(**item) for item in request.get("promotions", [])],
        )
    )
    consumer = register_consumer(
        ConsumerAgentRequest(
            name=request.get("consumer_name", "Consumer Dining Agent"),
            intent=request.get("consumer_intent", "anniversary dinner for two"),
            preferences=request.get("consumer_preferences", ["quiet table", "vegetarian starter", "wine pairing"]),
        )
    )
    connection = connect_agents(
        ConnectRequest(
            retailer_agent_id=retailer["id"],
            consumer_agent_id=consumer["id"],
            distance_m=request.get("distance_m", 130),
        )
    )
    return {
        "session_id": connection["connection_id"],
        "connection_id": connection["connection_id"],
        "menu": retailer["menu"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/sessions/{session_id}/events")
async def stream_legacy_events(session_id: str) -> StreamingResponse:
    return await stream_connection_events(session_id)


def parse_menu(text: str) -> list[MenuItem]:
    items: list[MenuItem] = []
    for line in [row.strip() for row in text.splitlines() if row.strip()]:
        parts = [part.strip() for part in line.split("|")]
        if len(parts) >= 4:
            section, name, description = parts[:3]
            price = extract_price(parts[3])
        elif len(parts) == 3:
            section, name, description = parts
            price = extract_price(description)
        elif len(parts) == 2:
            section = "Menu"
            name, description = parts
            price = extract_price(description)
        else:
            section = "Menu"
            name = re.sub(r"\s+[-–].*$", "", line).strip() or line
            description = line.replace(name, "").strip(" -–")
            price = extract_price(line)

        clean_description = re.sub(r"(€|\$|£)?\s?\d{1,3}([.,]\d{1,2})?$", "", description).strip()
        items.append(MenuItem(section=section or "Menu", name=name, description=clean_description, price=price))
    return items


def extract_price(text: str) -> float | None:
    match = re.search(r"(?:€|\$|£)?\s?(\d{1,3}(?:[.,]\d{1,2})?)\s*$", text)
    return float(match.group(1).replace(",", ".")) if match else None


def agent_event(
    event_type: str,
    speaker: str,
    protocol_action: str,
    english: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    return {
        "type": event_type,
        "speaker": speaker,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent_language": {
            "protocol": "agmentic-a2a.v1",
            "action": protocol_action,
            "payload": payload,
        },
        "english": english,
    }


def dump_model(model: BaseModel) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def serialize_retailer(agent: RetailerAgent) -> dict[str, Any]:
    return {
        "id": agent.id,
        "name": agent.name,
        "menu": [dump_model(item) for item in agent.menu],
        "promotions": [dump_model(promotion) for promotion in agent.promotions],
        "radius_m": agent.radius_m,
    }


def serialize_consumer(agent: ConsumerAgent) -> dict[str, Any]:
    return {
        "id": agent.id,
        "name": agent.name,
        "intent": agent.intent,
        "preferences": agent.preferences,
        "received_menu_items": len(agent.received_menu),
        "has_offer": agent.received_offer is not None,
    }


def choose_menu_hook(menu: list[MenuItem], preferences: list[str], intent: str) -> MenuItem:
    source = " ".join([intent, *preferences]).lower()
    for item in menu:
        item_text = f"{item.section} {item.name} {item.description}".lower()
        if any(word in item_text for word in source.split() if len(word) > 4):
            return item
    return menu[0]


def choose_counter_hook(menu: list[MenuItem], first_name: str) -> MenuItem:
    for item in menu:
        if item.name != first_name and item.section.lower() in {"starter", "dessert", "wine", "snacks"}:
            return item
    return menu[-1]


def calculate_offer_price(price: float | None, promotion: Promotion) -> float | None:
    if price is None:
        return None
    if promotion.type == "percentage":
        return round(price * (1 - min(promotion.value, 35) / 100), 2)
    if promotion.type == "fixed":
        return max(0, round(price - promotion.value, 2))
    return price


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
