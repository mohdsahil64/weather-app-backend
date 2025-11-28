require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');

const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: ['https://weather-app-frontend-smoky.vercel.app'], // यहाँ अपना Vercel frontend URL डालना
  credentials: true
}));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

// Schemas
const searchHistorySchema = new mongoose.Schema({
  city: { type: String, required: true },
  searchedAt: { type: Date, default: Date.now },
  userId: { type: String, default: 'default' }
});
const SearchHistory = mongoose.model('SearchHistory', searchHistorySchema);

const weatherCacheSchema = new mongoose.Schema({
  city: { type: String, required: true, unique: true },
  data: { type: Object, required: true },
  cachedAt: { type: Date, default: Date.now }
});
const WeatherCache = mongoose.model('WeatherCache', weatherCacheSchema);

// OpenWeatherMap API Config
const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

// Routes
app.get('/api/weather/:city', async (req, res) => {
  try {
    const { city } = req.params;

    const cached = await WeatherCache.findOne({
      city: city.toLowerCase(),
      cachedAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
    });

    if (cached) return res.json(cached.data);

    const response = await axios.get(
      `${BASE_URL}/weather?q=${city},IN&units=metric&appid=${WEATHER_API_KEY}`
    );

    await WeatherCache.findOneAndUpdate(
      { city: city.toLowerCase() },
      { city: city.toLowerCase(), data: response.data, cachedAt: new Date() },
      { upsert: true, new: true }
    );

    await SearchHistory.create({ city: response.data.name });

    res.json(response.data);
  } catch (error) {
    res.status(404).json({ message: 'City not found' });
  }
});

app.get('/api/forecast/:city', async (req, res) => {
  try {
    const { city } = req.params;
    const response = await axios.get(
      `${BASE_URL}/forecast?q=${city},IN&units=metric&appid=${WEATHER_API_KEY}`
    );

    const dailyData = [];
    const grouped = {};

    response.data.list.forEach(item => {
      const date = new Date(item.dt * 1000).toLocaleDateString('en-IN');
      if (!grouped[date]) {
        grouped[date] = {
          temps: [],
          humidity: [],
          wind: [],
          description: item.weather[0].description,
          icon: item.weather[0].icon
        };
      }
      grouped[date].temps.push(item.main.temp);
      grouped[date].humidity.push(item.main.humidity);
      grouped[date].wind.push(item.wind.speed);
    });

    Object.keys(grouped).slice(0, 7).forEach(date => {
      const data = grouped[date];
      dailyData.push({
        date,
        temperature: Math.round(data.temps.reduce((a, b) => a + b) / data.temps.length),
        humidity: Math.round(data.humidity.reduce((a, b) => a + b) / data.humidity.length),
        windSpeed: (data.wind.reduce((a, b) => a + b) / data.wind.length).toFixed(1),
        description: data.description,
        icon: data.icon
      });
    });

    res.json(dailyData);
  } catch (error) {
    res.status(404).json({ message: 'Forecast data not available' });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    const history = await SearchHistory.find()
      .sort({ searchedAt: -1 })
      .limit(10)
      .select('city searchedAt');

    const uniqueHistory = [];
    const seen = new Set();

    history.forEach(item => {
      if (!seen.has(item.city.toLowerCase())) {
        seen.add(item.city.toLowerCase());
        uniqueHistory.push(item);
      }
    });

    res.json(uniqueHistory);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching history' });
  }
});

app.delete('/api/history', async (req, res) => {
  try {
    await SearchHistory.deleteMany({});
    res.json({ message: 'History cleared' });
  } catch (error) {
    res.status(500).json({ message: 'Error clearing history' });
  }
});

app.get('/api/cities/search', async (req, res) => {
  const { q } = req.query;
  const indianCities = [
    "Mumbai","Delhi","Bangalore","Hyderabad","Ahmedabad","Chennai","Kolkata","Surat","Pune","Jaipur",
    "Lucknow","Kanpur","Nagpur","Indore","Thane","Bhopal","Visakhapatnam","Patna","Vadodara","Ghaziabad",
    "Ludhiana","Agra","Nashik","Faridabad","Meerut","Rajkot","Varanasi","Srinagar","Aurangabad","Amritsar",
    "Navi Mumbai","Allahabad","Ranchi","Coimbatore","Jabalpur","Gwalior","Vijayawada","Jodhpur","Madurai",
    "Raipur","Kota","Chandigarh","Guwahati","Solapur","Mysore","Bareilly","Aligarh","Moradabad","Jalandhar",
    "Bhubaneswar","Salem","Warangal","Thiruvananthapuram","Noida","Jamshedpur","Bhilai","Cuttack","Dehradun",
    "Durgapur","Asansol","Rourkela","Nanded","Kolhapur","Ajmer","Ujjain","Jhansi","Jammu","Mangalore","Erode",
    "Udaipur","Panipat"
  ];
  const filtered = indianCities.filter(city => city.toLowerCase().includes(q.toLowerCase())).slice(0, 5);
  res.json(filtered);
});

// Health route for Render
app.get('/health', (req, res) => res.json({ ok: true }));

// ✅ PORT declaration at the end
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
