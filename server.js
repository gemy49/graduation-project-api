const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const router = express.Router();

const app = express();
const PORT = 3000;
const JWT_SECRET = "your_jwt_secret_key";
const RESET_TOKEN_SECRET = "your_reset_token_secret"; // Different secret for reset tokens
const RESET_TOKEN_EXPIRY = 3600000; // 1 hour in milliseconds
const ADMIN_EMAIL = "ahmedelhalawany429@gmail.com"; // Fixed admin email
app.use(cors());
app.use(express.json());

const dbPath = path.join(__dirname, "data", "db.json");

////

// Middleware to verify JWT and check admin email or user ownership
const verifyAccess = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    // Allow access if the email is the admin email or the userId matches the token's id
    if (decoded.email !== ADMIN_EMAIL || decoded.id !== req.params.userId) {
      return res.status(403).json({
        message: `Only the admin (${ADMIN_EMAIL}) or the user can cancel flights`,
      });
    }
    req.user = decoded; // Store decoded token
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// POST endpoint to cancel a flight
router.post("/users/:userId/cancel-booking", verifyAccess, async (req, res) => {
  const { userId } = req.params;
  const { flightIndex } = req.body;

  try {
    // Validate flightIndex
    if (flightIndex === undefined || isNaN(parseInt(flightIndex))) {
      return res.status(400).json({ message: "Invalid flight index" });
    }

    // Read the database
    const data = await fs.readFile("db.json", "utf8");
    const db = JSON.parse(data);
    const users = db.users || [];

    // Find the user
    const userIndex = users.findIndex((user) => user.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({ message: "User not found" });
    }

    // Validate flight index
    const flightIdx = parseInt(flightIndex, 10);
    if (
      !users[userIndex].bookedFlights ||
      flightIdx < 0 ||
      flightIdx >= users[userIndex].bookedFlights.length
    ) {
      return res.status(404).json({ message: "Flight not found" });
    }

    // Remove the flight
    users[userIndex].bookedFlights.splice(flightIdx, 1);

    // Save updated data
    await fs.writeFile("db.json", JSON.stringify(db, null, 2));
    res.status(200).json({ message: "Flight canceled successfully" });
  } catch (error) {
    console.error("Error canceling flight:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

// Configure nodemailer (update with your email service credentials)
const transporter = nodemailer.createTransport({
  service: "gmail", // or your preferred email service
  auth: {
    user: "ahmedelhalawany429@gmail.com",
    pass: "xaqraunsmkwesrtu", // Replace with your app-specific password
  },
});

function readData() {
  const rawData = fs.readFileSync(dbPath);
  return JSON.parse(rawData);
}

function writeData(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

//////

// Forgot Password
app.post("/api/forgot-password", async (req, res) => {
  console.log("Received forgot-password request:", req.body);
  const { email } = req.body;

  if (!email) {
    console.log("Missing email");
    return res.status(400).json({ error: "Email is required" });
  }

  let data;
  try {
    data = readData();
    console.log(
      "Read data:",
      data.users.map((u) => u.email)
    );
  } catch (err) {
    console.error("Error reading db.json:", err);
    return res.status(500).json({ error: "Failed to read database" });
  }

  const user = data.users.find((u) => u.email === email);
  if (!user) {
    console.log("User not found:", email);
    return res.status(404).json({ error: "User not found" });
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  let resetTokenHash;
  try {
    resetTokenHash = await bcrypt.hash(resetToken, 10);
  } catch (err) {
    console.error("Error hashing token:", err);
    return res.status(500).json({ error: "Failed to generate reset token" });
  }

  const resetTokenExpiry = Date.now() + RESET_TOKEN_EXPIRY;
  user.resetToken = resetTokenHash;
  user.resetTokenExpiry = resetTokenExpiry;

  try {
    console.log("Writing data for user:", email);
    writeData(data);
  } catch (err) {
    console.error("Error writing to db.json:", err);
    return res.status(500).json({ error: "Failed to save reset token" });
  }

  const resetUrl = `http://localhost:5173/reset-password?token=${resetToken}&email=${encodeURIComponent(
    email
  )}`;
  const mailOptions = {
    from: "ahmedelhalawany429@gmail.com", // Match the auth.user
    to: email,
    subject: "Password Reset Request",
    html: `
      <p>You requested a password reset.</p> 
      <p><strong>Password Reset Verification Code:</strong> ${resetToken}</p>
      <p>Please copy this verification code and paste it into the mobile app to continue resetting your password.</p>
      <p><em>This code is valid for 1 hour.</em></p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Reset email sent to:", email);
    res.json({ message: "Password reset email sent" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: "Failed to send reset email" });
  }
});
// Reset Password
app.post("/api/reset-password", async (req, res) => {
  const { email, token, newPassword } = req.body;

  if (!email || !token || !newPassword) {
    return res
      .status(400)
      .json({ error: "Email, token, and new password are required" });
  }

  const data = readData();
  const user = data.users.find((u) => u.email === email);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Verify reset token
  if (
    !user.resetToken ||
    !user.resetTokenExpiry ||
    user.resetTokenExpiry < Date.now()
  ) {
    return res.status(400).json({ error: "Invalid or expired reset token" });
  }

  const isTokenValid = await bcrypt.compare(token, user.resetToken);
  if (!isTokenValid) {
    return res.status(400).json({ error: "Invalid reset token" });
  }

  // Update password and clear reset token
  user.password = await bcrypt.hash(newPassword, 10);
  user.resetToken = null;
  user.resetTokenExpiry = null;
  writeData(data);

  res.json({ message: "Password reset successfully" });
});

// ... (Previous code remains unchanged)

// User Registration
app.post("/api/register", async (req, res) => {
  const { email, password, name, phone } = req.body;

  if (!email || !password || !name || !phone) {
    return res
      .status(400)
      .json({ error: "Email, password, name, and phone are required" });
  }

  const data = readData();
  const userExists = data.users.find((u) => u.email === email);

  if (userExists) {
    return res.status(409).json({ error: "User already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: Date.now(),
    email,
    password: hashedPassword,
    name,
    phone,
    profilePhoto: "",
    favorites: [],
    bookedFlights: [],
    bookedHotels: [],
    resetToken: null,
    resetTokenExpiry: null,
  };

  data.users.push(newUser);
  writeData(data);

  const token = jwt.sign({ id: newUser.id, email }, JWT_SECRET, {
    expiresIn: "1h",
  });
  res.status(201).json({
    message: "User registered",
    token,
    user: {
      id: newUser.id,
      email,
      name,
      phone,
      profilePhoto: newUser.profilePhoto,
    },
  });
});

// User Login
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const data = readData();
  const user = data.users.find((u) => u.email === email);

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ id: user.id, email }, JWT_SECRET, {
    expiresIn: "24h",
  });
  res.json({
    message: "Login successful",
    token,
    user: {
      id: user.id,
      email,
      name: user.name,
      phone: user.phone,
      profilePhoto: user.profilePhoto,
    },
  });
});

// Google Login
app.post("/api/google-login", async (req, res) => {
  const { email, name, phone } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: "Email and name are required" });
  }

  const data = readData();
  let user = data.users.find((u) => u.email === email);

  if (!user) {
    user = {
      id: Date.now(),
      email,
      password: null,
      name,
      phone: phone || "",
      profilePhoto: "",
      favorites: [],
      bookedFlights: [],
      bookedHotels: [],
      resetToken: null,
      resetTokenExpiry: null,
    };
    data.users.push(user);
    writeData(data);
  }

  const token = jwt.sign({ id: user.id, email }, JWT_SECRET, {
    expiresIn: "1h",
  });
  res.json({
    message: "Google login successful",
    token,
    user: {
      id: user.id,
      email,
      name: user.name,
      phone: user.phone,
      profilePhoto: user.profilePhoto,
    },
  });
});

// Get User Profile (protected)
app.get("/api/users/:id/profile", authenticateToken, (req, res) => {
  const { id } = req.params;
  if (req.user.id !== parseInt(id)) {
    return res.status(403).json({ error: "Unauthorized access" });
  }

  const data = readData();
  const user = data.users.find((u) => u.id === parseInt(id));

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({ profilePhoto: user.profilePhoto || "" });
});

// Update User Profile (protected)
app.put("/api/users/:id/profile", authenticateToken, (req, res) => {
  const { id } = req.params;
  const { profilePhoto } = req.body;

  if (req.user.id !== parseInt(id)) {
    return res.status(403).json({ error: "Unauthorized access" });
  }

  if (!profilePhoto) {
    return res.status(400).json({ error: "profilePhoto is required" });
  }

  const data = readData();
  const user = data.users.find((u) => u.id === parseInt(id));

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  user.profilePhoto = profilePhoto;
  writeData(data);

  res.json({ message: "Profile photo updated", profilePhoto });
});

// ---------------- Flights ----------------

// GET flights with optional filters
app.get("/api/flights", (req, res) => {
  const { from, to, date } = req.query;
  let flights = readData().flights;

  if (from)
    flights = flights.filter(
      (f) => f.from.toLowerCase() === from.toLowerCase()
    );
  if (to)
    flights = flights.filter((f) => f.to.toLowerCase() === to.toLowerCase());
  if (date) flights = flights.filter((f) => f.date === date);

  res.json(flights);
});

app.get("/api/flights/:id", (req, res) => {
  const flightId = parseInt(req.params.id);
  const data = readData();
  const flight = data.flights.find((f) => f.id === flightId);

  if (!flight) {
    return res.status(404).json({ error: "Flight not found" });
  }

  res.json({
    id: flight.id,
    airline: flight.airline || "Unknown Airline",
    flightNumber: flight.flightNumber || "N/A",
    from: flight.from || "Unknown",
    to: flight.to || "Unknown",
    departureTime: flight.departureTime || "N/A",
    arrivalTime: flight.arrivalTime || "N/A",
    date: flight.date || "N/A",
    price: flight.price || "N/A",
  });
});

// POST flight (protected)
app.post("/api/flights", authenticateToken, (req, res) => {
  const data = readData();
  const newFlight = { id: Date.now(), ...req.body };
  data.flights.push(newFlight);
  writeData(data);
  res.status(201).json(newFlight);
});

// PUT flight by ID (protected)
app.put("/api/flights/:id", authenticateToken, (req, res) => {
  const flightId = parseInt(req.params.id);
  const updatedFlight = req.body;
  const data = readData();

  const index = data.flights.findIndex((f) => f.id === flightId);
  if (index === -1) return res.status(404).json({ error: "Flight not found" });

  data.flights[index] = { ...data.flights[index], ...updatedFlight };
  writeData(data);
  res.json({ message: "Flight updated", flight: data.flights[index] });
});

// DELETE flight by ID (protected)
app.delete("/api/flights/:id", authenticateToken, (req, res) => {
  const flightId = parseInt(req.params.id);
  const data = readData();

  const initialLength = data.flights.length;
  data.flights = data.flights.filter((f) => f.id !== flightId);

  if (data.flights.length === initialLength)
    return res.status(404).json({ error: "Flight not found" });

  writeData(data);
  res.json({ message: "Flight deleted" });
});

// ---------------- Hotels ----------------

// GET hotels by city
app.get("/api/hotels", (req, res) => {
  const { city } = req.query;
  let hotels = readData().hotels;

  if (city)
    hotels = hotels.filter((h) => h.city.toLowerCase() === city.toLowerCase());

  res.json(hotels);
});

app.get("/api/hotels/:id", (req, res) => {
  const hotelId = parseInt(req.params.id);
  const hotels = readData().hotels;

  const hotel = hotels.find((h) => h.id === hotelId);
  if (hotel) res.json(hotel);
  else res.status(404).json({ error: "Hotel not found" });
});

// POST - Book rooms of a specific type in a hotel (protected)
app.post("/api/hotels/:id/book", authenticateToken, (req, res) => {
  const hotelId = parseInt(req.params.id);
  const { roomType, quantity } = req.body;

  if (!roomType || !quantity || quantity <= 0) {
    return res
      .status(400)
      .json({ error: "roomType and valid quantity are required" });
  }

  const data = readData();
  const hotel = data.hotels.find((h) => h.id === hotelId);

  if (!hotel) {
    return res.status(404).json({ error: "Hotel not found" });
  }

  if (!Array.isArray(hotel.availableRooms)) {
    return res
      .status(400)
      .json({ error: "availableRooms not defined properly" });
  }

  const room = hotel.availableRooms.find(
    (r) => r.type.toLowerCase() === roomType.toLowerCase()
  );

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
    remaining: room.quantity,
  });
});

// Cancel booking (protected)
app.post("/api/cancel-booking", authenticateToken, (req, res) => {
  const { hotelId, rooms } = req.body;

  if (!hotelId || !Array.isArray(rooms) || rooms.length === 0) {
    return res.status(400).json({ error: "Missing or invalid booking data" });
  }

  const data = readData();
  const hotel = data.hotels.find((h) => h.id === parseInt(hotelId));

  if (!hotel) {
    return res.status(404).json({ error: "Hotel not found" });
  }

  let allRoomsValid = true;
  rooms.forEach(({ type, quantity }) => {
    const roomInHotel = hotel.availableRooms.find(
      (r) => r.type.toLowerCase() === type.toLowerCase()
    );
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

// POST hotel (protected)
app.post("/api/hotels", authenticateToken, (req, res) => {
  const data = readData();
  const newHotel = { id: Date.now(), ...req.body };
  data.hotels.push(newHotel);
  writeData(data);
  res.status(201).json(newHotel);
});

// PUT hotel by ID (protected)
app.put("/api/hotels/:id", authenticateToken, (req, res) => {
  const hotelId = parseInt(req.params.id);
  const updatedHotel = req.body;
  const data = readData();

  const index = data.hotels.findIndex((h) => h.id === hotelId);
  if (index === -1) return res.status(404).json({ error: "Hotel not found" });

  data.hotels[index] = { ...data.hotels[index], ...updatedHotel };
  writeData(data);
  res.json({ message: "Hotel updated", hotel: data.hotels[index] });
});

// DELETE hotel by ID (protected)
app.delete("/api/hotels/:id", authenticateToken, (req, res) => {
  const hotelId = parseInt(req.params.id);
  const data = readData();

  const initialLength = data.hotels.length;
  data.hotels = data.hotels.filter((h) => h.id !== hotelId);

  if (data.hotels.length === initialLength)
    return res.status(404).json({ error: "Hotel not found" });

  writeData(data);
  res.json({ message: "Hotel deleted" });
});

// ---------------- Places ----------------

// GET places by city
app.get("/api/places", (req, res) => {
  const { city } = req.query;
  let places = readData().places;

  if (city) {
    const cityData = places.find(
      (p) => p.city.toLowerCase() === city.toLowerCase()
    );
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

  for (const cityData of placesByCity) {
    const foundPlace = cityData.places.find((p) => p.id === parseInt(id));
    if (foundPlace) {
      return res.json(foundPlace);
    }
  }

  res.status(404).json({ message: "Place not found" });
});

// POST - Add new city with places (protected)
app.post("/api/places", authenticateToken, (req, res) => {
  const { city, places: newPlaces } = req.body;

  if (!city || !Array.isArray(newPlaces)) {
    return res
      .status(400)
      .json({ error: "city and places (array) are required" });
  }

  const data = readData();

  const existing = data.places.find(
    (p) => p.city.toLowerCase() === city.toLowerCase()
  );
  if (existing) return res.status(409).json({ error: "City already exists" });

  data.places.push({ city, places: newPlaces });
  writeData(data);

  res.status(201).json({ message: "City added", city });
});

// PUT - Update places for a city (protected)
app.put("/api/places", authenticateToken, (req, res) => {
  const { city, places: updatedPlaces } = req.body;

  if (!city || !Array.isArray(updatedPlaces)) {
    return res
      .status(400)
      .json({ error: "city and places (array) are required" });
  }

  const data = readData();

  const index = data.places.findIndex(
    (p) => p.city.toLowerCase() === city.toLowerCase()
  );
  if (index === -1) return res.status(404).json({ error: "City not found" });

  data.places[index].places = updatedPlaces;
  writeData(data);

  res.json({ message: "Places updated", city });
});

// DELETE - Delete city (protected)
app.delete("/api/places", authenticateToken, (req, res) => {
  const { city } = req.body;

  if (!city) return res.status(400).json({ error: "City is required" });

  const data = readData();
  const initialLength = data.places.length;

  data.places = data.places.filter(
    (p) => p.city.toLowerCase() !== city.toLowerCase()
  );
  if (data.places.length === initialLength)
    return res.status(404).json({ error: "City not found" });

  writeData(data);
  res.json({ message: "City deleted", city });
});

// ---------------- User Favorites & Booked Flights ----------------

function getOrCreateUser(email, data) {
  let user = data.users.find((u) => u.email === email);
  if (!user) {
    user = {
      id: Date.now(),
      email,
      password: null,
      name: null,
      phone: null,
      profilePhoto: "",
      favorites: [],
      bookedFlights: [],
      bookedHotels: [],
      resetToken: null,
      resetTokenExpiry: null,
    };
    data.users.push(user);
    writeData(data);
  }
  return user;
}

// GET favorites
app.get("/api/users/:id/favorites", authenticateToken, (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      console.log("Invalid user ID:", req.params.id);
      return res.status(400).json({ error: "Invalid user ID" });
    }
    const data = readData();
    const user = data.users.find((u) => u.id === userId);
    if (!user) {
      console.log("User not found:", userId);
      return res.status(404).json({ error: "User not found" });
    }
    if (req.user.id !== userId) {
      console.log("Unauthorized access for user:", userId);
      return res.status(403).json({ error: "Unauthorized" });
    }
    res.json(user.favorites || []);
  } catch (err) {
    console.error("Error in GET /favorites:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST favorite
app.post("/api/users/:id/favorites", (req, res) => {
  const userId = parseInt(req.params.id);
  const { favoriteId, type } = req.body;

  if (!favoriteId || !type) {
    return res.status(400).json({ error: "favoriteId and type are required" });
  }

  const data = readData();
  const user = data.users.find((u) => u.id === userId);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  user.favorites = user.favorites || [];

  // Prevent adding duplicate favorite of the same type and ID
  const alreadyExists = user.favorites.some(
    (f) => f.id === favoriteId && f.type === type
  );

  if (alreadyExists) {
    return res.status(400).json({ error: `${type} already favorited` });
  }

  let favorite = { id: favoriteId, type };

  if (type === "flight") {
    const {
      airline,
      flightNumber,
      from,
      to,
      departureTime,
      arrivalTime,
      date,
      price,
    } = req.body;

    favorite = {
      ...favorite,
      airline: airline || "Unknown Airline",
      flightNumber: flightNumber || "N/A",
      from: from || "Unknown",
      to: to || "Unknown",
      departureTime: departureTime || "N/A",
      arrivalTime: arrivalTime || "N/A",
      date: date || "N/A",
      price: price || 0,
    };
  } else if (type === "hotel") {
    const { name, city, image, description, rate, location } = req.body;

    favorite = {
      ...favorite,
      name: name || "Unnamed Hotel",
      city: city || "Unknown City",
      image: image || "",
      description: description || "",
      rate: rate || 0,
      location: location || "",
    };
  } else {
    return res.status(400).json({ error: "Unsupported favorite type" });
  }

  user.favorites.push(favorite);
  writeData(data);

  res.json({ favorites: user.favorites });
});

// DELETE favorite
app.delete("/api/users/:id/favorites", authenticateToken, (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      console.log("Invalid user ID:", req.params.id);
      return res.status(400).json({ error: "Invalid user ID" });
    }
    const data = readData();
    const user = data.users.find((u) => u.id === userId);
    if (!user) {
      console.log("User not found:", userId);
      return res.status(404).json({ error: "User not found" });
    }
    if (req.user.id !== userId) {
      console.log("Unauthorized access for user:", userId);
      return res.status(403).json({ error: "Unauthorized" });
    }
    const { favoriteId, type } = req.body;
    if (!favoriteId || !type) {
      console.log("Missing favoriteId or type:", req.body);
      return res.status(400).json({ error: "id and type are required" });
    }
    user.favorites = user.favorites.filter(
      (f) => !(f.id === favoriteId && f.type === type)
    );
    writeData(data);
    res.json({ favorites: user.favorites });
  } catch (err) {
    console.error("Error in DELETE /favorites:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get booked flights (protected)
app.get("/api/users/:id/bookings", authenticateToken, (req, res) => {
  const { id } = req.params;
  if (req.user.id !== parseInt(id)) {
    return res.status(403).json({ error: "Unauthorized access" });
  }
  const data = readData();
  const user = data.users.find((u) => u.id === parseInt(id));

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json(user.bookedFlights);
});

// Add booked flight (protected)
app.post("/api/users/:id/bookings", authenticateToken, (req, res) => {
  const { id } = req.params;
  if (req.user.id !== parseInt(id)) {
    return res.status(403).json({ error: "Unauthorized access" });
  }
  const {bFId, flightId, adults, children } = req.body;

  if (!flightId || adults === undefined || children === undefined || bFId === undefined) {
    return res.status(400).json({ error: "flightId, adults, and children are required" });
  }

  const data = readData();
  const user = getOrCreateUser(req.user.email, data);
  const flight = data.flights.find((f) => f.id === parseInt(flightId));

  if (!flight) {
    return res.status(404).json({ error: "Flight not found" });
  }
flight.price = flight.price * (adults + (children / 2));
  user.bookedFlights.push({ ...flight, adults, children, bFId });
  writeData(data);

  res.json({ message: "Flight booked", bookedFlights: user.bookedFlights });
});

// Cancel booking (protected)
// app.post("/api/users/:id/cancel-booking", authenticateToken, (req, res) => {
//   const { id } = req.params;
//   if (req.user.id !== parseInt(id)) {
//     return res.status(403).json({ error: "Unauthorized access" });
//   }
//   const { flightId } = req.body;

//   if (!flightId) {
//     return res.status(400).json({ error: "flightId is required" });
//   }

//   const data = readData();
//   const user = data.users.find((u) => u.id === parseInt(id));

//   if (!user) {
//     return res.status(404).json({ error: "User not found" });
//   }

//   user.bookedFlights = user.bookedFlights.filter((f) => f.id !== parseInt(flightId));
//   writeData(data);

//   res.json({ message: "Booking cancelled", bookedFlights: user.bookedFlights });
// });

app.post("/api/users/:id/cancel-booking", authenticateToken, (req, res) => {
  const { id } = req.params;
  const { bFId } = req.body;

  console.log('Request body:', req.body); // Debug: Log the request body

  // Check if bFId is provided and is a non-empty string
  if (!bFId || typeof bFId !== 'string' || bFId.trim() === '') {
    console.error('Invalid or missing bFId:', req.body.bFId);
    return res.status(400).json({ error: 'bFId is required and must be a valid string' });
  }

  // Ensure user ID is authorized
  const isAdmin = req.user.email === "ahmedelhalawany429@gmail.com";
  if (req.user.id !== parseInt(id) && !isAdmin) {
    return res.status(403).json({ error: "Unauthorized access" });
  }

  try {
    const data = readData();
    const user = data.users.find((u) => u.id === parseInt(id));

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const bookingFlight = user.bookedFlights.find((b) => b.bFId === bFId);
    if (!bookingFlight) {
      return res.status(404).json({ error: "Booking not found" });
    }

    user.bookedFlights = user.bookedFlights.filter((f) => f.bFId !== bFId);

    writeData(data);

    res.json({ message: "Booking cancelled", bookedFlights: user.bookedFlights });
  } catch (error) {
    console.error("Error during cancellation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get booked hotels (protected)
app.get("/api/users/:id/hotel-bookings", authenticateToken, (req, res) => {
  const { id } = req.params;
  if (req.user.id !== parseInt(id)) {
    return res.status(403).json({ error: "Unauthorized access" });
  }
  const data = readData();
  const user = data.users.find((u) => u.id === parseInt(id));

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json(user.bookedHotels);
});

// Add booked hotel (protected)
app.post("/api/users/:id/hotel-bookings", authenticateToken, (req, res) => {
  const { id } = req.params;
  if (req.user.id !== parseInt(id)) {
    return res.status(403).json({ error: "Unauthorized access" });
  }
  const {
    bookingId,
    hotelId,
    hotelName,
    city,
    rooms,
    totalCost,
    bookingDate,
    checkIn,
    checkOut,
    discountApplied,
  } = req.body;

  if (
    !bookingId ||
    !hotelId ||
    !hotelName ||
    !city ||
    !rooms ||
    !totalCost ||
    !bookingDate ||
    !checkIn ||
    !checkOut
  ) {
    return res.status(400).json({
      error:
        "bookingId, hotelId, hotelName, city, rooms, totalCost, bookingDate, checkIn, and checkOut are required",
    });
  }

  const data = readData();
  const user = getOrCreateUser(req.user.email, data);
  const hotel = data.hotels.find((h) => h.id === parseInt(hotelId));

  if (!hotel) {
    return res.status(404).json({ error: "Hotel not found" });
  }

  user.bookedHotels.push({
    bookingId,
    hotelId,
    hotelName,
    city,
    rooms,
    totalCost,
    fullName: user.name,
    phone: user.phone,
    bookingDate,
    checkIn,
    checkOut,
    discountApplied,
  });
  writeData(data);

  res.json({ message: "Hotel booked", bookedHotels: user.bookedHotels });
});

// Cancel hotel booking (protected)
// app.post("/api/users/:id/cancel-hotel-booking", authenticateToken, (req, res) => {
//   const { id } = req.params;
//    const isAdmin = req.user.email === "ahmedelhalawany429@gmail.com";
//   if (req.user.id !== parseInt(id) && !isAdmin) {
//     return res.status(403).json({ error: "Unauthorized access" });
//   }

//   if (req.user.id !== parseInt(id)) {
//     return res.status(403).json({ error: "Unauthorized access" });
//   }
//   const { bookingId } = req.body;

//   if (!bookingId) {
//     return res.status(400).json({ error: "bookingId is required" });
//   }

//   const data = readData();
//   const user = data.users.find((u) => u.id === parseInt(id));

//   if (!user) {
//     return res.status(404).json({ error: "User not found" });
//   }

//   const booking = user.bookedHotels.find((b) => b.bookingId === bookingId);
//   if (!booking) {
//     return res.status(404).json({ error: "Booking not found" });
//   }

//   const hotel = data.hotels.find((h) => h.id === booking.hotelId);
//   if (hotel) {
//     booking.rooms.forEach((bookedRoom) => {
//       const room = hotel.availableRooms.find((r) => r.type === bookedRoom.type);
//       if (room) {
//         room.quantity += bookedRoom.count;
//       }
//     });
//   }

//   user.bookedHotels = user.bookedHotels.filter((b) => b.bookingId !== bookingId);
//   writeData(data);

//   res.json({ message: "Hotel booking cancelled", bookedHotels: user.bookedHotels });
// });

app.post(
  "/api/users/:id/cancel-hotel-booking",
  authenticateToken,
  (req, res) => {
    const { id } = req.params;
    const { bookingId } = req.body;

    const isAdmin = req.user.email === "ahmedelhalawany429@gmail.com";
    if (req.user.id !== parseInt(id) && !isAdmin) {
      return res.status(403).json({ error: "Unauthorized access" });
    }

    if (!bookingId) {
      return res.status(400).json({ error: "bookingId is required" });
    }

    const data = readData();
    const user = data.users.find((u) => u.id === parseInt(id));

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const booking = user.bookedHotels.find((b) => b.bookingId === bookingId);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const hotel = data.hotels.find((h) => h.id === booking.hotelId);
    if (hotel) {
      booking.rooms.forEach((bookedRoom) => {
        const room = hotel.availableRooms.find(
          (r) => r.type === bookedRoom.type
        );
        if (room) {
          room.quantity += bookedRoom.count;
        }
      });
    }

    user.bookedHotels = user.bookedHotels.filter(
      (b) => b.bookingId !== bookingId
    );
    writeData(data);

    res.json({
      message: "Hotel booking cancelled",
      bookedHotels: user.bookedHotels,
    });
  }
);
//////
// Edit hotel booking
app.put("/api/users/:id/edit-hotel-booking", authenticateToken, (req, res) => {
  const { id } = req.params;
  const { bookingId, updatedBooking } = req.body;

  const isAdmin = req.user.email === "ahmedelhalawany429@gmail.com";
  if (req.user.id !== parseInt(id) && !isAdmin) {
    return res.status(403).json({ error: "Unauthorized access" });
  }

  if (!bookingId || !updatedBooking) {
    return res
      .status(400)
      .json({ error: "bookingId and updatedBooking data are required" });
  }

  const data = readData();
  const user = data.users.find((u) => u.id === parseInt(id));
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const bookingIndex = user.bookedHotels.findIndex(
    (b) => b.bookingId === bookingId
  );
  if (bookingIndex === -1) {
    return res.status(404).json({ error: "Booking not found" });
  }

  // Optionally: validate fields inside `updatedBooking`
  const existingBooking = user.bookedHotels[bookingIndex];
  user.bookedHotels[bookingIndex] = {
    ...existingBooking,
    ...updatedBooking,
    bookingId, // ensure bookingId remains unchanged
  };

  writeData(data);

  res.json({
    message: "Booking updated successfully",
    updatedBooking: user.bookedHotels[bookingIndex],
  });
});

// Get airlines
app.get("/api/airlines", (req, res) => {
  const data = readData();
  res.json(data.airlines);
});

// Get airline by ID
app.get("/api/airlines/:id", (req, res) => {
  const { id } = req.params;
  const data = readData();
  const airline = data.airlines.find((a) => a.id === parseInt(id));

  if (!airline) {
    return res.status(404).json({ error: "Airline not found" });
  }

  res.json(airline);
});

// Add airline (protected)
app.post("/api/airlines", authenticateToken, (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  const data = readData();
  const newId =
    data.airlines.length > 0
      ? Math.max(...data.airlines.map((a) => a.id)) + 1
      : 1;
  const newAirline = { id: newId, name };
  data.airlines.push(newAirline);
  writeData(data);

  res.json({ message: "Airline added", airline: newAirline });
});

// Delete airline (protected)
app.delete("/api/airlines/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const data = readData();
  const airlineIndex = data.airlines.findIndex((a) => a.id === parseInt(id));

  if (airlineIndex === -1) {
    return res.status(404).json({ error: "Airline not found" });
  }

  const isUsed = data.flights.some((f) => f.airlineId === parseInt(id));
  if (isUsed) {
    return res
      .status(400)
      .json({ error: "Cannot delete airline; it is used in existing flights" });
  }

  data.airlines.splice(airlineIndex, 1);
  writeData(data);

  res.json({ message: "Airline deleted", airlines: data.airlines });
});

// Get flights with airline names
app.get("/api/flights", (req, res) => {
  const data = readData();
  const flightsWithAirlineNames = data.flights.map((flight) => {
    const airline = data.airlines.find((a) => a.id === flight.airlineId);
    return { ...flight, airline: airline ? airline.name : "Unknown Airline" };
  });
  res.json(flightsWithAirlineNames);
});

// Get all users with full booking/favorites info (protected)
app.get("/api/users", authenticateToken, (req, res) => {
  const data = readData();

  const users = data.users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    profilePhoto: user.profilePhoto,
    favorites: user.favorites || [],
    bookedFlights: user.bookedFlights || [],
    bookedHotels: user.bookedHotels || [],
  }));

  res.json(users);
});

// Delete user
app.delete("/api/users/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const data = readData();

  const userIndex = data.users.findIndex((u) => u.id == id);
  if (userIndex === -1) {
    return res.status(404).json({ error: "User not found" });
  }

  const deletedUser = data.users.splice(userIndex, 1);
  writeData(data);

  res.json({ message: "User deleted", user: deletedUser[0] });
});

// Edit user
app.put("/api/users/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name, email, phone } = req.body;
  const data = readData();

  const userIndex = data.users.findIndex((u) => u.id == id);
  if (userIndex === -1) {
    return res.status(404).json({ error: "User not found" });
  }

  const user = data.users[userIndex];

  user.name = name || user.name;
  user.email = email || user.email;
  user.phone = phone || user.phone;

  data.users[userIndex] = user;
  writeData(data);

  res.json({ message: "User updated", user });
});

// ---------------- Server ----------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
