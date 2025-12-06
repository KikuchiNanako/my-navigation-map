 /**
  * GPXファイルのテキスト内容を解析
  * @parm {string} gpxText
  * @returns {Array<{lat: number, lon: number, time: Date}>}
  */
 function parseGpx(gpxText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, "text/xml");
    
    //エラーチェック
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
        throw new Error("GPXファイル解析エラー");
    }

    const trkpts = xmlDoc.getElementsByTagName('trkpt');
    const points = [];

    for (let i = 0; i < trkpts.length; i++) {
        const point = trkpts[i];
        const lat = parseFloat(point.getAttribute('lat'));
        const lon = parseFloat(point.getAttribute('lon'));

        let timeElement = point.getElementsByTagName('time')[0];
        let time = timeElement ? new Date(timeElement.textContent) : null;
        
        if (!isNaN(lat) && !isNaN(lon) && time) {
            points.push({ lat, lon, time });
        }
    }
    return points;
 }