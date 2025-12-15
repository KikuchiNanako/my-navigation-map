export default function handler(req, res) {
    console.log("Environment variable check:", process.env.GOOGLE_MAPS_API_KEY ? "Key Found": "Key NOT Found");
    
    res.status(200).json({ key: process.env.GOOGLE_MAPS_API_KEY });
}