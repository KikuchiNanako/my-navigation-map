 /**
  * GPXファイルを読み込み、全ポイント処理する
  */
 async function processFiles() {
    const fileInput = document.getElementById(`gpxFileInput`);
    const files = fileInput.files;
    allPoints = [];

    if (files.length === 0) {
        logMessage("ファイルが選択されていません");
        return;
    }

    logMessage(`選択されたファイル数: ${files.length}`);

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const gpxText = await file.text();
            const points = parseGpx(gpxText);
            allPoints.push(...points);
            logMessage(`ファイル読みこみ終了`);
        } catch (e) {
            logMessage(`ファイル読み込みエラー: ${e.message}`);
        }
    }

    if (allPoints.length === 0) {
        logMessage("有効なGPXポイントが見つかりませんでした");
        gpxProcessed = false;
        return;
    }

    logMessage(`全ポイント数: ${allPoints.length}`);
    calculateFrequentPoints();
    if (typeof drawMap === 'function') drawMap();
    gpxProcessed = true;
 }

 function processFilesWrapper() {
    const fileInput = document.getElementById('gpxFile');

    if (fileInput.files.length === 0) {
        logMessage("エラー：GPXファイルを選択してください");
        return;
    }

    logMessage("GPXファイルの処理を開始");

    if (typeof processFiles === 'function') {
        processFiles();
        document.getElementById('drawMapButton').disabled = false;
    } else {
        logMessage("エラー： processeFiles 関数が見つかりません");
    }
 }

 function calculateFrequentPoints () {
    const processedPoints = allPoints.map(p => {
        const lat_r = roundToDecimals(p.lat, ROUND_DECIMALS);
        const lon_r = roundToDecimals(p.lon, ROUND_DECIMALS);
        const month = `${p.time.getFullYear()}-${String(p.time.getMonth() + 1).padStart(2, '0')}`;
        return { lat_r, lon_r, time: p.time, month };
    });

    // ===点を丸めてカウント==

    //全期間のカウント
    const pointCountsMap = new Map();
    processedPoints.forEach(p => {
        const key = `${p.lat_r}, ${p.lon_r}`;
        pointCountsMap.set(key, (pointCountsMap.get(key) || 0) + 1);
    });

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const recentPointsMap = new Map();

    processedPoints.filter(p => p.time >= cutoffDate).forEach(p => {
        const key = `${p.lat_r}, ${p.lon_r}`;
        recentPointsMap.set(key, (recentPointsMap.get(key) || 0) + 1);
    });

    const recentHighPoints = [];
    for (const [key, count] of recentPointsMap.entries()) {
        if (count >= 5) {
            const [lat_r, lon_r] = key.split(',').map(Number);
            recentHighPoints.push({ lat_r, lon_r });
        }
    }

    const monthlyCountsMap = new Map();
    processedPoints.forEach(p => {
        const key = `${p.month}_${p.lat_r},${p.lon_r}`;
        monthlyCountsMap.set(key, (monthlyCountsMap.get(key) || 0) + 1);
    });

    const frequentOldPointsKeys = new Set();
    for (const [key, count] of monthlyCountsMap.entries()) {
        if (count >= 20) {
            const [month, latLonKey] = key.split('_');
            frequentOldPointsKeys.add(latLonKey);
        }
    }

    const frequentPointsSet = new Set(recentHighPoints.map(p => `${p.lat_r}, ${p.lon_r}`));
    frequentOldPointsKeys.forEach(key => frequentPointsSet.add(key));

    frequentPoints = Array.from(frequentPointsSet).map(key => {
        const [lat_r, lon_r] = key.split(',').map(Number);
        return { lat_r, lon_r };
    });
   
    logMessage(`よく通る道の点数: ${frequentPoints.length}`);
 }

 /**
  * 現在地が経路外か判定
  * @param {number} currentLat
  * @param {number} currentLon
  * @returns {boolean} 経路外か
  */
 function isOutsideRoute(currentLat, currentLon) {
    if (frequentPoints.length === 0) {
        return true;
    }

    let minDist = Infinity;

    for (const point of frequentPoints) {
        const dist = getDistanceMeters(currentLat, currentLon, point.lat_r, point.lon_r);
        if (dist < minDist) {
            minDist = dist;
        }
    }

    logMessage(`最近傍距離: ${minDist.toFixed(1)}m`);

    return minDist > THRESHOLD_M;
 }