export default function handler(req, res) {
    res.status(200).json({ key: Proces.env.GOOGLE_MAPS_API_KEY });
}