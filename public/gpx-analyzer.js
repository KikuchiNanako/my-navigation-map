function calculateFrequentSegments () {
    const points = appState.allPoints;
    
    if (!points || points.length === 0) {
        appState.frequentSegments = [];
        return;
    }

    const segmentCountMap = new Map();

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

    //====頻出区間====
    appState.frequentSegments = Array.from(segmentCountMap.values()).filter(segment => segment.count >= 3);

    logMessage(`よく通る区間： ${appState.frequentSegments.length}`);
}

/**
  * 現在地が経路外か判定
  * @param {number} currentLat
  * @param {number} currentLon
  * @returns {boolean} 経路外か
  */
function isOutsideRoute(currentLat, currentLon) {
    if (appState.frequentSegments.length === 0) {
        return true;
    }

    let minDist = Infinity;

    for (const segment of appState.frequentSegments) {
        const dist = getDistanceToSegmentMeters(currentLat, currentLon, segment.start.lat, segment.start.lng,segment.end.lat, segment.end.lng);
        if (dist < minDist) {
            minDist = dist;
        }
    }
    return minDist > THRESHOLD_M;
}