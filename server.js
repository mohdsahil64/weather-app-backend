require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// CORS में सिर्फ frontend Vercel URL allow करो
app.use(cors({
  origin: ['https://sahil-weather.vercel.app/'], // Vercel frontend URL डालो
  credentials: true
}));

// Health check route (Render test के लिए)
app.get('/health', (req, res) => res.json({ ok: true }));

// Server listen
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

// Search History Schema
const searchHistorySchema = new mongoose.Schema({
  city: { type: String, required: true },
  searchedAt: { type: Date, default: Date.now },
  userId: { type: String, default: 'default' }
});

const SearchHistory = mongoose.model('SearchHistory', searchHistorySchema);

// Weather Data Schema (Cache)
const weatherCacheSchema = new mongoose.Schema({
  city: { type: String, required: true, unique: true },
  data: { type: Object, required: true },
  cachedAt: { type: Date, default: Date.now }
});

const WeatherCache = mongoose.model('WeatherCache', weatherCacheSchema);

// OpenWeatherMap API Configuration
const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

// Routes

// Get current weather
app.get('/api/weather/:city', async (req, res) => {
  try {
    const { city } = req.params;
    
    // Check cache first (valid for 10 minutes)
    const cached = await WeatherCache.findOne({ 
      city: city.toLowerCase(),
      cachedAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
    });
    
    if (cached) {
      return res.json(cached.data);
    }
    
    // Fetch from OpenWeatherMap API
    const response = await axios.get(
      `${BASE_URL}/weather?q=${city},IN&units=metric&appid=${WEATHER_API_KEY}`
    );
    
    // Cache the result
    await WeatherCache.findOneAndUpdate(
      { city: city.toLowerCase() },
      { city: city.toLowerCase(), data: response.data, cachedAt: new Date() },
      { upsert: true, new: true }
    );
    
    // Save to search history
    await SearchHistory.create({ city: response.data.name });
    
    res.json(response.data);
  } catch (error) {
    res.status(404).json({ message: 'City not found' });
  }
});

// Get weather forecast (7 days)
app.get('/api/forecast/:city', async (req, res) => {
  try {
    const { city } = req.params;
    
    const response = await axios.get(
      `${BASE_URL}/forecast?q=${city},IN&units=metric&appid=${WEATHER_API_KEY}`
    );
    
    // Process forecast data
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
        date: date,
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

// Get search history
app.get('/api/history', async (req, res) => {
  try {
    const history = await SearchHistory.find()
      .sort({ searchedAt: -1 })
      .limit(10)
      .select('city searchedAt');
    
    // Remove duplicates, keep most recent
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

// Delete search history
app.delete('/api/history', async (req, res) => {
  try {
    await SearchHistory.deleteMany({});
    res.json({ message: 'History cleared' });
  } catch (error) {
    res.status(500).json({ message: 'Error clearing history' });
  }
});

// Autocomplete cities
app.get('/api/cities/search', async (req, res) => {
  const { q } = req.query;
  
  const indianCities = [
    'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Ahmedabad', 'Chennai', 'Kolkata',
    'Surat', 'Pune', 'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane',
    'Bhopal', 'Visakhapatnam', 'Pimpri-Chinchwad', 'Patna', 'Vadodara', 'Ghaziabad',
    'Ludhiana', 'Agra', 'Nashik', 'Faridabad', 'Meerut', 'Rajkot', 'Kalyan-Dombivali',
    'Vasai-Virar', 'Varanasi', 'Srinagar', 'Aurangabad', 'Dhanbad', 'Amritsar',
    'Navi Mumbai', 'Allahabad', 'Ranchi', 'Howrah', 'Coimbatore', 'Jabalpur',
    'Gwalior', 'Vijayawada', 'Jodhpur', 'Madurai', 'Raipur', 'Kota', 'Chandigarh',
    'Guwahati', 'Solapur', 'Hubli-Dharwad', 'Mysore', 'Tiruchirappalli', 'Bareilly',
    'Aligarh', 'Tiruppur', 'Moradabad', 'Jalandhar', 'Bhubaneswar', 'Salem',
    'Warangal', 'Mira-Bhayandar', 'Thiruvananthapuram', 'Bhiwandi', 'Saharanpur',
    'Guntur', 'Amravati', 'Bikaner', 'Noida', 'Jamshedpur', 'Bhilai', 'Cuttack',
    'Firozabad', 'Kochi', 'Nellore', 'Bhavnagar', 'Dehradun', 'Durgapur', 'Asansol',
    'Rourkela', 'Nanded', 'Kolhapur', 'Ajmer', 'Akola', 'Gulbarga', 'Jamnagar',
    'Ujjain', 'Loni', 'Siliguri', 'Jhansi', 'Ulhasnagar', 'Jammu', 'Sangli-Miraj',
    'Mangalore', 'Erode', 'Belgaum', 'Ambattur', 'Tirunelveli', 'Malegaon', 'Gaya',
    'Udaipur', 'Maheshtala', 'Panipat'
  ];
  
  const filtered = indianCities
    .filter(city => city.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 5);
  
  res.json(filtered);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
