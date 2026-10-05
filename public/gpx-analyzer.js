function calculateFrequentPoints () {
    const points = appState.allPoints;
    
    if (!points || points.length === 0) {
        appState.frequentPoints = [];
        appState.frequentSegments = [];
        return;
    }

    const monthlyCountsMap = new Map();
    const recentPointsMap = new Map();
    const segmentCountMap = new Map();

    const now = Date.now();
    const cutoffTime = now - (30 * 24 * 60 * 60 * 1000);

    //元データを直接時系列順にする  
    const sortedPoints = [...points].sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    let previousPoint = null;

    //====全地点を１回のループで処理====
    for (const p of sortedPoints) {
        const time = p.time instanceof Date
            ? p.time
            : new Date(p.time);
        
        const timeMs = time.getTime();

        //不正な日時は無視
        if (Number.isNaN(timeMs)) {
            continue;
        }

        const lat_r = roundToDecimals(p.lat, ROUND_DECIMALS);
        const lon_r = roundToDecimals(p.lon, ROUND_DECIMALS);

        const pointKey = `${lat_r}, ${lon_r}`;

        //====月ごとの地点カウント====
        const month = `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, "0")}`;

        const monthlyKey = `${month}_${pointKey}`;

        monthlyCountsMap.set(
            monthlyKey,
            (monthlyCountsMap.get(monthlyKey) || 0) + 1
        );

        //====直近３０日の地点カウント====
        if (timeMs >= cutoffTime) {
            recentPointsMap.set(
                pointKey,
                (recentPointsMap.get(pointKey) || 0) + 1
            );
        }

        //====頻出区間のカウント ====
        if (previousPoint) {
            const timeDiff = (timeMs - previousPoint.timeMs) / 1000;

            if(timeDiff <= 600) {
                const distance = getDistanceMeters(
                    previousPoint.lat_r,
                    previousPoint.lon_r,
                    lat_r,
                    lon_r
                );

                if (distance >= 5 && distance <= 200) {
                    const SEGMENT_DECIMALS = 4;

                    const aLat = roundToDecimals(
                        previousPoint.lat_r,
                        SEGMENT_DECIMALS
                    );

                    const aLon = roundToDecimals(
                        previousPoint.lon_r,
                        SEGMENT_DECIMALS
                    )

                    const bLat = roundToDecimals(
                        lat_r,
                        SEGMENT_DECIMALS
                    );

                    const bLon = roundToDecimals(
                        lon_r,
                        SEGMENT_DECIMALS
                    );

                    const keyA = `${aLat},${aLon}`;
                    const keyB = `${bLat},${bLon}`;

                    const segmentKey = 
                        keyA < keyB
                            ? `${keyA}|${keyB}`
                            : `${keyB}|${keyA}`;

                    const existing = segmentCountMap.get(segmentKey);

                    if (existing) {
                        existing.count++;
                    } else {
                        segmentCountMap.set(segmentKey, {
                            start: {
                                lat: previousPoint.lat_r,
                                lng: previousPoint.lon_r
                            },
                            end: {
                                lat: lat_r,
                                lng: lon_r
                            },
                            count: 1
                        });
                    }
                }
            }
        }
        previousPoint = {
            lat_r,
            lon_r,
            timeMs
        };
    }

    //====頻出地点を作る====
    const frequentPointsSet = new Set();

    //過去のいずれかの月で２回以上
    for (const [key, count] of monthlyCountsMap) {
        if (count >= 2) {
            const separatorIndex = key.indexOf("_");

            if (separatorIndex !== -1) {
                frequentPointsSet.add(
                    key.slice(separatorIndex + 1)
                );
            }
        }
    }

    //直近３０日で２０回以上
    for (const [key, count] of recentPointsMap) {
        if (count >= 20) {
            frequentPointsSet.add(key);
        }
    }

    appState.frequentPoints = Array.from(frequentPointsSet, key => {
        const [lat_r, lon_r] = key.split(",").map(Number);
        return{
            lat_r, lon_r
        };
    });

    //====頻出区間====
    appState.frequentSegments = Array.from(segmentCountMap.values()).filter(segment => segment.count >= 3);

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