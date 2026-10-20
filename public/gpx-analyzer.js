//GPX判定の安定化
let stableOutside = null;
let outsideCount = 0;
let insideCount = 0;

const REQUIRED_CONSECUTIVE = 3;

function getStableRouteStatus(isOutside) {
    if (stableOutside === null) {
        stableOutside = isOutside;
        return stableOutside;
    }

    if (isOutside) {
        outsideCount++;
        insideCount = 0;

        if (outsideCount >= REQUIRED_CONSECUTIVE) {
            stableOutside = true;
        }
    } else {
        insideCount++;
        outsideCount = 0;

        if (insideCount >= REQUIRED_CONSECUTIVE) {
            stableOutside = false;
        }
    }
    return stableOutside;
}

function calculateFrequentSegments () {
    const points = appState.allPoints;
    
    if (!points || points.length === 0) {
        appState.frequentSegments = [];
        return;
    }

    const segmentCountMap = new Map();
    const trackGroups = new Map();

    //直近１か月の期間を設定
    const now = new Date();
    const oneMonthAgo = new Date(now);

    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const recentStartMs = oneMonthAgo.getTime();
    const nowMs = now.getTime();
    
    //10分以上の記録の余白は別の移動区間として扱う
    const MAX_TIME_GAP_MS = 10 * 60 * 1000;
    
    //走行IDがない古いデータも保持する
    const legacyPoints = [];

    //データを走行IDごとに分類
    for (const p of points) {
        const timeMs = new Date(p.time).getTime();

        if (
            !Number.isFinite(timeMs) || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)
        ) {
            continue;
        }

        const point = {
            lat: p.lat,
            lon: p.lon,
            timeMs
        };

        if (p.trackId) {
            if (!trackGroups.has(p.trackId)) {
                trackGroups.set(p.trackId, []);
            }

            trackGroups.get(p.trackId).push(point);
        } else {
            legacyPoints.push(point);
        }
    }

    //古いデータを連続した移動ごとに分割する
    let legacyGroup = [];
    let legacyIndex = 0;

    for (const point of legacyPoints) {
        if (legacyGroup.length > 0) {
            const prev = legacyGroup[legacyGroup.length - 1];
            const timeDiff = point.timeMs - prev.timeMs;

            if (timeDiff > MAX_TIME_GAP_MS) {
                trackGroups.set(
                    `legacy-${legacyIndex++}`,
                    legacyGroup
                );
                legacyGroup = [];
            }
        }
        legacyGroup.push(point);
    }

    if (legacyGroup.length > 0) {
            trackGroups.set(
                `legacy-${legacyIndex++}`,
                legacyGroup
            );
    }

    //====走行ごとに区間を分析====
    for (const trackPoints of trackGroups.values()) {
        trackPoints.sort((a, b) => a.timeMs - b.timeMs);

        //同じ走行で同一区間を重複カウントしない
        const visitedSegments = new Set();
        const visitedRecentSegments = new Set();
        const visitedMonthlySegments = new Set();

        for (let i = 1; i < trackPoints.length; i++) {
            const p1 = trackPoints[i - 1];
            const p2 = trackPoints[i];

            const timeDiff = p2.timeMs - p1.timeMs;

            if (timeDiff > MAX_TIME_GAP_MS) {
                continue;
            }

            const distance = getDistanceMeters(
                p1.lat,
                p1.lon,
                p2.lat,
                p2.lon
            );

            if (distance < 5 || distance > 200) {
                continue;
            }

            const SEGMENT_DECIMALS = 4;
                    
            const aLat = roundToDecimals(p1.lat,SEGMENT_DECIMALS);
            const aLon = roundToDecimals(p1.lon,SEGMENT_DECIMALS);
            const bLat = roundToDecimals(p2.lat,SEGMENT_DECIMALS);
            const bLon = roundToDecimals(p2.lon,SEGMENT_DECIMALS);

            const keyA = `${aLat},${aLon}`;
            const keyB = `${bLat},${bLon}`;

            //区間を通過した日時
            const timestamp = p2.timeMs;

            if (timestamp > nowMs) continue;

            const date = new Date(timestamp);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            //区間データを取得、なければ作成
            let segment = segmentCountMap.get(segmentKey);

            if (!segment) {
                segment = {
                    start: { lat: p1.lat, lng: p1.lon },
                    end: { lat: p2.lat, lng: p2.lon },
                    count: 0,
                    recentCount: 0,
                    monthlyCounts: {}
                };
                segmentCountMap.set(segmentKey, segment);
            }

            //これまでの総走行回数
            if (!visitedSegments.has(segmentKey)) {
                segment.count++;
                visitedSegments.add(segmentKey);
            }

            //直近１か月の走行回数
            if (timestamp >= recentStartMs && !visitedRecentSegments.has(segmentKey)) {
                segment.recentCount++;
                visitedRecentSegments.add(segmentKey);
            }

            //各暦月の走行回数
            const monthSegmentKey = `${monthKey}|${segmentKey}`;

            if (!visitedMonthlySegments.has(monthSegmentKey)) {
                segment.monthlyCounts[monthKey] = (segment.monthlyCounts[monthKey] || 0) + 1;

                visitedMonthlySegments.add(monthSegmentKey);
            }

            /*
            const segmentKey = 
                keyA < keyB
                    ? `${keyA}|${keyB}`
                    : `${keyB}|${keyA}`;
            
            if (visitedSegments.has(segmentKey)) {
                continue;
            }

            visitedSegments.add(segmentKey);

            const existing = segmentCountMap.get(segmentKey);

            if (existing) {
                existing.count++;
            } else {
                segmentCountMap.set(segmentKey, {
                    start: {
                        lat: p1.lat,
                        lng: p1.lon
                    },
                    end: {
                        lat: p2.lat,
                        lng: p2.lon
                    },
                    count: 1
                });
            }
            */
        }
    }
    

    //====頻出区間====
    appState.frequentSegments = Array.from(segmentCountMap.values()).filter(segment => 
        segment.count >= 5 ||
        Object.values(segment.monthlyCounts).some(count => count >= 20)
    );

    logMessage(`よく通る区間： ${appState.frequentSegments.length}`);
    logMessage(
        `分析結果：全${points.length}地点、` +
        `${trackGroups.size}移動グループ、` +
        `${segmentCountMap.size}種類の区間`
    );
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