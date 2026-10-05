 function calculateFrequentPoints () {
    const processedPoints = appState.allPoints.map(p => {
        const lat_r = roundToDecimals(p.lat, ROUND_DECIMALS);
        const lon_r = roundToDecimals(p.lon, ROUND_DECIMALS);

        const time = p.time instanceof Date
            ? p.time
            : new Date(p.time);

        const month = `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, '0')}`;
        return { lat_r, lon_r, time, month };
    });

    // ===点を丸めてカウント==

    const monthlyCountsMap = new Map();

    processedPoints.forEach(p => {
        const key = `${p.month}_${p.lat_r},${p.lon_r}`;
        monthlyCountsMap.set(key, (monthlyCountsMap.get(key) || 0) + 1);
    });

    //過去のいずれかの月で２０回以上カウントされた場所をすべて保存するセット
    const frequentOldPointsKeys = new Set();

    //全データを見て、月ごとの基準を超えた場所をすべて蓄積
    for (const [key, count] of monthlyCountsMap.entries()) {
        if (count >= 2) {
            const [, latLonKey] = key.split('_');
            frequentOldPointsKeys.add(latLonKey);
        }
    }

    //直近３０日間のカウント
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const recentPointsMap = new Map();

    processedPoints.filter(p => p.time >= cutoffDate).forEach(p => {
        const key = `${p.lat_r},${p.lon_r}`;
        recentPointsMap.set(key, (recentPointsMap.get(key) || 0) + 1);
    });

    const recentHighPoints = [];
    for (const [key, count] of recentPointsMap.entries()) {
        if (count >= 20) {
            const [lat_r, lon_r] = key.split(',').map(Number);
            recentHighPoints.push({ lat_r, lon_r });
        }
    }

    const frequentPointsSet = new Set(recentHighPoints.map(p => `${p.lat_r},${p.lon_r}`));
    frequentOldPointsKeys.forEach(key => frequentPointsSet.add(key));

    //地図表示用の配列に変換
    appState.frequentPoints = Array.from(frequentPointsSet).map(key => {
        const [lat_r, lon_r] = key.split(',').map(Number);
        return { lat_r, lon_r };
    });

    const segmentCountMap = new Map();

    //時系列に並べる
    const sortedPoints = [...processedPoints].sort((a, b) => a.time - b.time);

    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const a = sortedPoints[i];
        const b = sortedPoints[i + 1];

        const timeDiff = (b.time - a.time) / 1000;

        if (timeDiff > 600) { continue };

        const distance = getDistanceMeters( a.lat_r, a.lon_r, b.lat_r, b.lon_r );

        //同じ場所すぎる点は無視
        if (distance < 5 || distance > 200) {
            continue;
        }

        const SEGMENT_DECIMALS = 4;

        const aLat = roundToDecimals(a.lat_r, SEGMENT_DECIMALS);
        const aLon = roundToDecimals(a.lon_r, SEGMENT_DECIMALS);

        const bLat = roundToDecimals(b.lat_r, SEGMENT_DECIMALS);
        const bLon = roundToDecimals(b.lon_r, SEGMENT_DECIMALS);

        const keyA = `${aLat},${aLon}`;
        const keyB = `${bLat},${bLon}`;

        const segmentKey = [keyA, keyB].sort().join('|');

        if (!segmentCountMap.has(segmentKey)) {
            segmentCountMap.set(
                segmentKey,
                {
                    start: {
                        lat: a.lat_r,
                        lng: a.lon_r
                    },

                    end: {
                        lat: b.lat_r,
                        lng: b.lon_r
                    },

                    count: 0
                }
            );
        }

        segmentCountMap.get(segmentKey).count++;
    }

    console.log("区間カウント:", Array.from(segmentCountMap.values()).sort((a,b) => b.count - a.count));

    //頻繁に通る区間だけ残す
    appState.frequentSegments = Array.from(segmentCountMap.values()).filter(segment => segment.count >= 5);
    
    
    logMessage(`よく通る道の点数: ${appState.frequentPoints.length}`);
    logMessage(`よく通る区間： ${appState.frequentSegments.length}`);
 }

 /**
  * 現在地が経路外か判定
  * @param {number} currentLat
  * @param {number} currentLon
  * @returns {boolean} 経路外か
  */
 function isOutsideRoute(currentLat, currentLon) {
    if (appState.frequentPoints.length === 0) {
        return true;
    }

    let minDist = Infinity;
    let nearestPoint = null;

    for (const point of appState.frequentPoints) {
        const dist = getDistanceMeters(currentLat, currentLon, point.lat_r, point.lon_r);
        if (dist < minDist) {
            minDist = dist;
            nearestPoint = point;
        }
    }

    logMessage(`最近傍距離: ${minDist.toFixed(1)}m`);

    return minDist > THRESHOLD_M;
 }