import path from "path";
import fs from "fs";

export default function handler(req, res) {
    const { filename } = req.query;

    const filePath = path.join(process.cwd(), "gpx_files",filename);

    if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "File not found" });
        return;
    }

    const fileContent = fs.readFileSync(filePath);

    res.setHeader("Content-Type", "application/xml");
    res.status(200).send(fileContent)
}
