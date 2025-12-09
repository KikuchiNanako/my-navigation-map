const fs =  require("fs");
const path = require("path");

module.exports = (req, res) => {

    const GPX_DIR = path.join(process.cwd(), "gpx_files");

    fs.readdir(GPX_DIR, (err, files) => {
        if (err) {
            console.error("フォルダ読み込みエラー", err);
            return res.status(500).json({ error: "フォルダを読み込めませんでした"});
        }

        const gpxFiles = files.filter(f => f.toLocaleLowerCase().endsWith(".gpx"));
        res.json(gpxFiles)
    });
};