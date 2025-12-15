export default function handler(req, res) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    res.status(200).json({ key: apiKey });

}