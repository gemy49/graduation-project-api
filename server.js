const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const dbPath = path.join(__dirname, "data", "db.json");

function readData() {
  const rawData = fs.readFileSync(dbPath);
  return JSON.parse(rawData);
}

function writeData(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// ---------------- Flights ----------------

// ✅ GET flights with optional filters
app.get("/api/flights", (req, res) => {
  const { from, to, date } = req.query;
  let flights = readData().flights;

  if (from) flights = flights.filter(f => f.from.toLowerCase() === from.toLowerCase());
  if (to) flights = flights.filter(f => f.to.toLowerCase() === to.toLowerCase());
  if (date) flights = flights.filter(f => f.date === date);

  res.json(flights);
});

// ✅ POST flight
app.post("/api/flights", (req, res) => {
  const data = readData();
  const newFlight = { id: Date.now(), ...req.body };
  data.flights.push(newFlight);
  writeData(data);
  res.status(201).json(newFlight);
});

// ✅ PUT flight by ID
app.put("/api/flights/:id", (req, res) => {
  const flightId = parseInt(req.params.id);
  const updatedFlight = req.body;
  const data = readData();

  const index = data.flights.findIndex(f => f.id === flightId);
  if (index === -1) return res.status(404).json({ error: "Flight not found" });

  data.flights[index] = { ...data.flights[index], ...updatedFlight };
  writeData(data);
  res.json({ message: "Flight updated", flight: data.flights[index] });
});

// ✅ DELETE flight by ID
app.delete("/api/flights/:id", (req, res) => {
  const flightId = parseInt(req.params.id);
  const data = readData();

  const initialLength = data.flights.length;
  data.flights = data.flights.filter(f => f.id !== flightId);

  if (data.flights.length === initialLength) return res.status(404).json({ error: "Flight not found" });

  writeData(data);
  res.json({ message: "Flight deleted" });
});

// ---------------- Hotels ----------------

// ✅ GET hotels by city
app.get("/api/hotels", (req, res) => {
  const { city } = req.query;
  let hotels = readData().hotels;

  if (city) hotels = hotels.filter(h => h.city.toLowerCase() === city.toLowerCase());

  res.json(hotels);
});

// ✅ POST hotel
app.post("/api/hotels", (req, res) => {
  const data = readData();
  const newHotel = { id: Date.now(), ...req.body };
  data.hotels.push(newHotel);
  writeData(data);
  res.status(201).json(newHotel);
});

// ✅ PUT hotel by ID
app.put("/api/hotels/:id", (req, res) => {
  const hotelId = parseInt(req.params.id);
  const updatedHotel = req.body;
  const data = readData();

  const index = data.hotels.findIndex(h => h.id === hotelId);
  if (index === -1) return res.status(404).json({ error: "Hotel not found" });

  data.hotels[index] = { ...data.hotels[index], ...updatedHotel };
  writeData(data);
  res.json({ message: "Hotel updated", hotel: data.hotels[index] });
});

// ✅ DELETE hotel by ID
app.delete("/api/hotels/:id", (req, res) => {
  const hotelId = parseInt(req.params.id);
  const data = readData();

  const initialLength = data.hotels.length;
  data.hotels = data.hotels.filter(h => h.id !== hotelId);

  if (data.hotels.length === initialLength) return res.status(404).json({ error: "Hotel not found" });

  writeData(data);
  res.json({ message: "Hotel deleted" });
});

// ---------------- Places ----------------

// ✅ GET places by city
app.get("/api/places", (req, res) => {
  const { city } = req.query;
  let places = readData().places;

  if (city) {
    const cityData = places.find(p => p.city.toLowerCase() === city.toLowerCase());
    if (cityData) {
      res.json(cityData.places);
    } else {
      res.json([]);
    }
  } else {
    res.json(places);
  }
});

// ✅ POST - Add new city with places
app.post("/api/places", (req, res) => {
  const { city, places: newPlaces } = req.body;

  if (!city || !Array.isArray(newPlaces)) {
    return res.status(400).json({ error: "city and places (array) are required" });
  }

  const data = readData();

  const existing = data.places.find(p => p.city.toLowerCase() === city.toLowerCase());
  if (existing) return res.status(409).json({ error: "City already exists" });

  data.places.push({ city, places: newPlaces });
  writeData(data);

  res.status(201).json({ message: "City added", city });
});

// ✅ PUT - Update places for a city
app.put("/api/places", (req, res) => {
  const { city, places: updatedPlaces } = req.body;

  if (!city || !Array.isArray(updatedPlaces)) {
    return res.status(400).json({ error: "city and places (array) are required" });
  }

  const data = readData();

  const index = data.places.findIndex(p => p.city.toLowerCase() === city.toLowerCase());
  if (index === -1) return res.status(404).json({ error: "City not found" });

  data.places[index].places = updatedPlaces;
  writeData(data);

  res.json({ message: "Places updated", city });
});

// ✅ DELETE - Delete city
app.delete("/api/places", (req, res) => {
  const { city } = req.body;

  if (!city) return res.status(400).json({ error: "City is required" });

  const data = readData();
  const initialLength = data.places.length;

  data.places = data.places.filter(p => p.city.toLowerCase() !== city.toLowerCase());
  if (data.places.length === initialLength) return res.status(404).json({ error: "City not found" });

  writeData(data);
  res.json({ message: "City deleted", city });
});

// ---------------- Server ----------------
app.listen(PORT,'0.0.0.0',() => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
