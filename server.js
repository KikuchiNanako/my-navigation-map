const express = require ("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

const GPX_DIR = path.join(__dirname, "gpx_files");

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/gpx", (req, res) => {
    fs.readdir(GPX_DIR, (err, files) => {
        if(err) {
            console.error("フォルダ読み込みエラー", err);
            return res.status(500).json({ error: "フォルダを読み込めませんでした" });
        }

        const gpxFiles = files.filter(f => f.toLowerCase().endsWith(".gpx"));
        res.json(gpxFiles);
    });
});

app.get("/api/gpx/:filename", (req, res) => {
    const filePath = path.join(GPX_DIR, req.params.filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send("Not found");
    }

    res.sendFile(filePath);
    
});

app.listen(PORT, () => {
    console.log(`http://localhost:${PORT}`)
});