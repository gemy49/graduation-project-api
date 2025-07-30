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

app.get("/api/hotels/:id", (req, res) => {
  const hotelId = parseInt(req.params.id);
  const hotels = readData().hotels;

  console.log("Looking for hotel ID:", hotelId);
  console.log("Available hotel IDs:", hotels.map(h => h.id));

  const hotel = hotels.find(h => h.id === hotelId);
  if (hotel) res.json(hotel);
  else res.status(404).json({ error: "Hotel not found" });
});


////
// ✅ POST - Book rooms of a specific type in a hotel
app.post("/api/hotels/:id/book", (req, res) => {
  const hotelId = parseInt(req.params.id);
  const { roomType, quantity } = req.body;

  if (!roomType || !quantity || quantity <= 0) {
    return res.status(400).json({ error: "roomType and valid quantity are required" });
  }

  const data = readData();
  const hotel = data.hotels.find(h => h.id === hotelId);

  if (!hotel) {
    return res.status(404).json({ error: "Hotel not found" });
  }

  if (!Array.isArray(hotel.availableRooms)) {
    return res.status(400).json({ error: "availableRooms not defined properly" });
  }

  const room = hotel.availableRooms.find(r => r.type.toLowerCase() === roomType.toLowerCase());

  if (!room) {
    return res.status(404).json({ error: `Room type "${roomType}" not found` });
  }

  if (room.quantity < quantity) {
    return res.status(400).json({ error: "Not enough rooms available" });
  }

  room.quantity -= quantity;
  writeData(data);

  res.json({
    message: "Booking successful",
    roomType: room.type,
    booked: quantity,
    remaining: room.quantity
  });
});

// Updated cancel booking endpoint
app.post("/api/cancel-booking", (req, res) => {
  const { hotelId, rooms } = req.body;

  if (!hotelId || !Array.isArray(rooms) || rooms.length === 0) {
    return res.status(400).json({ error: "Missing or invalid booking data" });
  }

  const data = readData();
  const hotel = data.hotels.find(h => h.id === parseInt(hotelId));

  if (!hotel) {
    return res.status(404).json({ error: "Hotel not found" });
  }

  // Restore room quantities
  let allRoomsValid = true;
  rooms.forEach(({ type, quantity }) => {
    const roomInHotel = hotel.availableRooms.find(r => r.type.toLowerCase() === type.toLowerCase());
    if (roomInHotel) {
      roomInHotel.quantity += quantity;
    } else {
      allRoomsValid = false;
    }
  });

  if (!allRoomsValid) {
    return res.status(400).json({ error: "One or more room types not found" });
  }

  writeData(data);

  res.json({ message: "Booking cancelled and rooms returned successfully" });
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

app.get("/api/places/:id", (req, res) => {
  const { id } = req.params;
  const placesByCity = readData().places;

  // دَوّر على المكان في كل المدن
  for (const cityData of placesByCity) {
    const foundPlace = cityData.places.find(p => p.id === parseInt(id));
    if (foundPlace) {
      return res.json(foundPlace);
    }
  }

  res.status(404).json({ message: "Place not found" });
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
//////


// ---------------- User Favorites & Booked Flights ----------------

function getOrCreateUser(email, data) {
  let user = data.users.find(u => u.email === email);
  if (!user) {
    user = { email, favorites: [], bookedFlights: [],bookedHotels: [] };
    data.users.push(user);
    writeData(data);
  }
  return user;
}

// إضافة يوزر جديد عند الـ login
app.post("/api/users", (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const data = readData();
  let user = data.users.find(u => u.email === email);
  if (!user) {
    user = { email, favorites: [], bookedFlights: [],bookedHotels: [] };
    data.users.push(user);
    writeData(data);
  }
  else {
    if (!user.bookedHotels) {
      user.bookedHotels = [];
      writeData(data);
    }
    if (!user.favorites) {
      user.favorites = [];
      writeData(data);
      
    } if (!user.bookedFlights) {
      user.bookedFlights = [];
      writeData(data);
   }
  }

  res.json({ message: "User added or already exists", user });
});

// جلب الـ favorites
app.get("/api/users/:email/favorites", (req, res) => {
  const { email } = req.params;
  const data = readData();
  const user = data.users.find(u => u.email === email);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(user.favorites||[]);
});

// إضافة favorite
app.post("/api/users/:email/favorites", (req, res) => {
  const { email } = req.params;
  const { id, type } = req.body;

  if (!id || !type) {
    return res.status(400).json({ error: "id and type are required" });
  }

  const data = readData();
  const user = getOrCreateUser(email, data);

  const exists = user.favorites.find(f => f.id === id && f.type === type);
  if (!exists) {
    user.favorites.push(req.body);
    writeData(data);
  }

  res.json({ message: "Favorite added", favorites: user.favorites });
});

// إزالة favorite
app.delete("/api/users/:email/favorites", (req, res) => {
  const { email } = req.params;
  const { id, type } = req.body;

  if (!id || !type) {
    return res.status(400).json({ error: "id and type are required" });
  }

  const data = readData();
  const user = data.users.find(u => u.email === email);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  user.favorites = user.favorites.filter(f => !(f.id === id && f.type === type));
  writeData(data);

  res.json({ message: "Favorite removed", favorites: user.favorites });
});

// جلب الـ booked flights
app.get("/api/users/:email/bookings", (req, res) => {
  const { email } = req.params;
  const data = readData();
  const user = data.users.find(u => u.email === email);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json(user.bookedFlights);
});

// إضافة booked flight
app.post("/api/users/:email/bookings", (req, res) => {
  const { email } = req.params;
  const { flightId, adults, children } = req.body;

  if (!flightId || adults === undefined || children === undefined) {
    return res.status(400).json({ error: "flightId, adults, and children are required" });
  }

  const data = readData();
  const user = getOrCreateUser(email, data);
  const flight = data.flights.find(f => f.id === parseInt(flightId));

  if (!flight) {
    return res.status(404).json({ error: "Flight not found" });
  }

  user.bookedFlights.push({ ...flight, adults, children });
  writeData(data);

  res.json({ message: "Flight booked", bookedFlights: user.bookedFlights });
});

// إلغاء الحجز
app.post("/api/users/:email/cancel-booking", (req, res) => {
  const { email } = req.params;
  const { flightId } = req.body;

  if (!flightId) {
    return res.status(400).json({ error: "flightId is required" });
  }

  const data = readData();
  const user = data.users.find(u => u.email === email);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  user.bookedFlights = user.bookedFlights.filter(f => f.id !== parseInt(flightId));
  writeData(data);

  res.json({ message: "Booking cancelled", bookedFlights: user.bookedFlights });
});


app.get("/api/users/:email/hotel-bookings", (req, res) => {
  const { email } = req.params;
  const data = readData();
  const user = data.users.find(u => u.email === email);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json(user.bookedHotels);
});

// إضافة booked hotel
app.post("/api/users/:email/hotel-bookings", (req, res) => {
  const { email } = req.params;
  const { bookingId, hotelId, hotelName, city, rooms, totalCost, fullName, phone, bookingDate } = req.body;

  if (!bookingId || !hotelId || !hotelName || !city || !rooms || !totalCost || !fullName || !phone || !bookingDate) {
    return res.status(400).json({ error: "bookingId, hotelId, hotelName, city, rooms, totalCost, fullName, phone, and bookingDate are required" });
  }

  const data = readData();
  const user = getOrCreateUser(email, data);
  const hotel = data.hotels.find(h => h.id === parseInt(hotelId));

  if (!hotel) {
    return res.status(404).json({ error: "Hotel not found" });
  }

  user.bookedHotels.push({ bookingId, hotelId, hotelName, city, rooms, totalCost, fullName, phone, bookingDate });
  writeData(data);

  res.json({ message: "Hotel booked", bookedHotels: user.bookedHotels });
});

// إلغاء حجز فندق
app.post("/api/users/:email/cancel-hotel-booking", (req, res) => {
  const { email } = req.params;
  const { bookingId } = req.body;

  if (!bookingId) {
    return res.status(400).json({ error: "bookingId is required" });
  }

  const data = readData();
  const user = data.users.find(u => u.email === email);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const booking = user.bookedHotels.find(b => b.bookingId === bookingId);
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  // إعادة الغرف إلى المخزون
  const hotel = data.hotels.find(h => h.id === booking.hotelId);
  if (hotel) {
    booking.rooms.forEach(bookedRoom => {
      const room = hotel.availableRooms.find(r => r.type === bookedRoom.type);
      if (room) {
        room.quantity += bookedRoom.count;
      }
    });
  }

  user.bookedHotels = user.bookedHotels.filter(b => b.bookingId !== bookingId);
  writeData(data);

  res.json({ message: "Hotel booking cancelled", bookedHotels: user.bookedHotels });
});

// جلب الفنادق
app.get("/api/hotels", (req, res) => {
  const data = readData();
  res.json(data.hotels);
});

// جلب تفاصيل فندق
app.get("/api/hotels/:id", (req, res) => {
  const { id } = req.params;
  const data = readData();
  const hotel = data.hotels.find(h => h.id === parseInt(id));

  if (!hotel) {
    return res.status(404).json({ error: "Hotel not found" });
  }

  res.json(hotel);
});

// حجز غرفة في فندق
app.post("/api/hotels/:id/book", (req, res) => {
  const { id } = req.params;
  const { roomType, quantity } = req.body;

  if (!roomType || !quantity) {
    return res.status(400).json({ error: "roomType and quantity are required" });
  }

  const data = readData();
  const hotel = data.hotels.find(h => h.id === parseInt(id));

  if (!hotel) {
    return res.status(404).json({ error: "Hotel not found" });
  }

  const room = hotel.availableRooms.find(r => r.type === roomType);
  if (!room) {
    return res.status(400).json({ error: "Room type not found" });
  }

  if (room.quantity < quantity) {
    return res.status(400).json({ error: "Not enough rooms available" });
  }

  room.quantity -= quantity;
  writeData(data);

  res.json({ message: "Room booked successfully", hotel });
});

//////////////////////////////////////////////////////////////////
// جلب كل الـ airlines
app.get("/api/airlines", (req, res) => {
  const data = readData();
  res.json(data.airlines);
});

// جلب airline بناءً على id
app.get("/api/airlines/:id", (req, res) => {
  const { id } = req.params;
  const data = readData();
  const airline = data.airlines.find(a => a.id === parseInt(id));

  if (!airline) {
    return res.status(404).json({ error: "Airline not found" });
  }

  res.json(airline);
});

// إضافة airline جديد
app.post("/api/airlines", (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  const data = readData();
  const newId = data.airlines.length > 0 ? Math.max(...data.airlines.map(a => a.id)) + 1 : 1;
  const newAirline = { id: newId, name };
  data.airlines.push(newAirline);
  writeData(data);

  res.json({ message: "Airline added", airline: newAirline });
});

// حذف airline
app.delete("/api/airlines/:id", (req, res) => {
  const { id } = req.params;
  const data = readData();
  const airlineIndex = data.airlines.findIndex(a => a.id === parseInt(id));

  if (airlineIndex === -1) {
    return res.status(404).json({ error: "Airline not found" });
  }

  // التأكد من أن الـ airline مش مستخدم في أي flights
  const isUsed = data.flights.some(f => f.airlineId === parseInt(id));
  if (isUsed) {
    return res.status(400).json({ error: "Cannot delete airline; it is used in existing flights" });
  }

  data.airlines.splice(airlineIndex, 1);
  writeData(data);

  res.json({ message: "Airline deleted", airlines: data.airlines });
});

// جلب الـ flights مع اسم الـ airline
app.get("/api/flights", (req, res) => {
  const data = readData();
  const flightsWithAirlineNames = data.flights.map(flight => {
    const airline = data.airlines.find(a => a.id === flight.airlineId);
    return { ...flight, airline: airline ? airline.name : "Unknown Airline" };
  });
  res.json(flightsWithAirlineNames);
});



// ---------------- Server ----------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
