const fs = require("fs");
const path = require("path");

module.exports = (req, res) => {
    const { filename } = req.query;

    const filePath = path.join(process.cwd(), "gpx_files",filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send("Not found");
    }

    res.sendFile(filePath);

};