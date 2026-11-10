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

    const uniqueTrackGroups = new Map();
    const seenSignatures = new Set();
    let skipiedDuplicates = 0;

    for (const [trackId, trackPoints] of trackGroups) {
        if ( trackPoints.length === 0) continue;

        const sorted = [...trackPoints].sort((a, b) => a.timeMs - b.timeMs);

        const first = sorted[0];
        const last = sorted[sorted.length - 1];

        const signature = [
            sorted.length,
            first.timeMs,
            last.timeMs,
            first.lat.toFixed(5),
            first.lon.toFixed(5),
            last.lat.toFixed(5),
            last.lon.toFixed(5)
        ].join("|");

        if(seenSignatures.has(signature)) {
            skipiedDuplicates++
            continue;
        }
        seenSignatures.add(signature);
        uniqueTrackGroups.set(trackId, trackPoints);
    }
    logMessage(`分析から除外した重複走行：${skipiedDuplicates}`);

    //===円方式による習熟地点の分析===
    appState.frequentPoints = calculateFrequentPoints( uniqueTrackGroups );

    logMessage(`円方式の習熟地点：${appState.frequentPoints.length}`);

    //====走行ごとに区間を分析====
    //位置は２０ｍメッシュ、方向は３０度単位で分類する
    const GRID_SIZE_M = 20;
    const DIRECTION_STEP_DEG = 30;
    const SAMPLE_INTERVAL_M = 10;
    const MIN_SEGMENT_M = 5;
    const MAX_SEGMENT_M = 200;

    //経度の距離感さんは分析対象の代表経度を使用
    const referenceLat = points[0].lat;
    const lonScale = 111320 * Math.cos(referenceLat * Math.PI / 180);

    //メートル座標に変換
    const toXY = (lat, lon) => ({
        x: lon * lonScale,
        y: lat * 111320
    });

    //線分の方向を０～１８０度に正規化
    //逆方向の走行も同じ方向として扱う
    const getDirectionBin = (dx, dy) => {
        let deg = Math.atan2(dy, dx) * 180 / Math.PI;
        deg = ((deg % 180) + 180) % 180;

        return Math.floor(deg / DIRECTION_STEP_DEG);
    };

    for (const trackPoints of uniqueTrackGroups.values()) {
        trackPoints.sort((a, b) => a.timeMs - b.timeMs);

        //同じ走行で同一区間を重複カウントしない
        const visitedSegments = new Set();
        const visitedRecentSegments = new Set();
        const visitedMonthlySegments = new Set();

        for (let i = 1; i < trackPoints.length; i++) {
            const p1 = trackPoints[i - 1];
            const p2 = trackPoints[i];

            const timeDiff = p2.timeMs - p1.timeMs;

            if (timeDiff <= 0 || timeDiff > MAX_TIME_GAP_MS) {
                continue;
            }

            const distance = getDistanceMeters(
                p1.lat, p1.lon, p2.lat, p2.lon
            );

            if (distance < MIN_SEGMENT_M || distance > MAX_SEGMENT_M) {
                continue;
            }

            const xy1 = toXY(p1.lat, p1.lon);
            const xy2 = toXY(p2.lat, p2.lon);

            const dx = xy2.x - xy1.x;
            const dy = xy2.y - xy1.y;

            const directionBin = getDirectionBin(dx, dy);

            //GPS線分を約１０ｍ感覚でサンプリング
            const sampleCount = Math.max( 1, Math.ceil(distance / SAMPLE_INTERVAL_M));

            const timestamp = p2.timeMs;
            if (timestamp > nowMs) continue;

            const date = new Date(timestamp);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            //方向ベクトルを正規化
            const vectorLength = Math.hypot(dx, dy);
            const ux = dx / vectorLength;
            const uy = dy / vectorLength;

            for (let j = 0; j < sampleCount; j++) {
                const t = (j + 0.5) / sampleCount;

                const x = xy1.x + dx * t;
                const y = xy1.y + dy * t;

                const gridX = Math.floor(x / GRID_SIZE_M);
                const gridY = Math.floor(y / GRID_SIZE_M);

                const segmentKey = `${gridX},${gridY},${directionBin}`;

                let segment = segmentCountMap.get(segmentKey);

                if (!segment) {
                    //サンプル位置を中心に２０ｍの代表線分を作る
                    const halfLength = GRID_SIZE_M / 2;
    
                    const startX = x - ux * halfLength;
                    const startY = y - uy * halfLength;
                    const endX = x + ux * halfLength;
                    const endY = y + uy * halfLength;

                    segment = {
                        start: {
                            lat: startY / 111320,
                            lng: startX / lonScale
                    },
                    end: {
                        lat: endY / 111320,
                        lng: endX / lonScale
                    },
                    count: 0,
                    recentCount: 0,
                    monthlyCounts: {}
                };
                segmentCountMap.set(segmentKey, segment);
            }

            if (!visitedSegments.has(segmentKey)) {
                segment.count++;
                visitedSegments.add(segmentKey);
            }

            if (timestamp >= recentStartMs && !visitedRecentSegments.has(segmentKey)) {
                segment.recentCount++;
                visitedRecentSegments.add(segmentKey);
            }

            const monthSegmentKey = `${monthKey}|${segmentKey}`;

            if (!visitedMonthlySegments.has(monthSegmentKey)) {
                segment.monthlyCounts[monthKey] = (segment.monthlyCounts[monthKey] || 0) + 1;

                visitedMonthlySegments.add(monthSegmentKey);
            }

        } 
        }
    }
    
    //全期間で3回以上通過した区間を習熟区間とする
    const MIN_VISITS = 3;

    appState.frequentSegments = Array.from(
        segmentCountMap.values()
    ).filter(segment => segment.count >= MIN_VISITS);

    /*
    //====頻出区間====
    appState.frequentSegments = Array.from(segmentCountMap.values()).filter(segment => 
        segment.recentCount >= 5 ||
        Object.values(segment.monthlyCounts).some(count => count >= 20)
    );

    appState.bridgeSegments = [];
    */
    
    //円方式と線分方式を組み合わせて短い隙間を補完する
    const bridgeStartTime = performance.now();

    appState.bridgeSegments = buildFamiliarBridges(
        appState.frequentSegments,
        appState.frequentPoints
    );

    //補完した区間を習熟区間に追加
    //appState.frequentSegments.push(...appState.bridgeSegments);

    logMessage(`補完した習熟区間：${appState.bridgeSegments.length}本`);
    

    const allSegments = Array.from(segmentCountMap.values());

    const maxCount = Math.max(0, ...allSegments.map(s => s.count));

    const maxRecentCount = Math.max(0, ...allSegments.map(s => s.recentCount));

    const countDistribution = {
        once: allSegments.filter(s => s.count === 1).length,
        twice: allSegments.filter(s => s.count === 2).length,
        threeOrMore: allSegments.filter(s => s.count >= 3).length,
        fiveOrMore: allSegments.filter(s => s.count >= 5).length
    };

    logMessage(`区間の最大通過回数：${maxCount}`);
    logMessage(`直近１か月の最大通過回数：${maxRecentCount}`);
    logMessage(`区間の通過回数分布：${JSON.stringify(countDistribution)}`);

    logMessage(`よく通る区間： ${appState.frequentSegments.length}`);
    logMessage(
        `分析結果：全${points.length}地点、` +
        `${trackGroups.size}移動グループ、` +
        `${segmentCountMap.size}種類の区間`
    );

    const trackSignatures = new Map();
    let duplicateTrackCount = 0;

    for (const [trackId, trackPoints] of trackGroups) {
        if (trackPoints.length === 0) continue;

        const sorted = [...trackPoints].sort((a, b) => a.timeMs - b.timeMs);

        const first = sorted[0];
        const last = sorted[sorted.length - 1];

        const signature = [
            sorted.length,
            first.timeMs,
            last.timeMs,
            first.lat.toFixed(5),
            first.lon.toFixed(5),
            last.lat.toFixed(5),
            last.lon.toFixed(5)
        ].join("|");

        if (trackSignatures.has(signature)) {
            duplicateTrackCount++
        } else { trackSignatures.set(signature, trackId)};
    }
    logMessage(`重複している可能性がある走行グループ：${duplicateTrackCount}`);
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

/**
 * ルートと過去の走行履歴の一致率を計算する
 * @param {object} route Google Mapsの経路データ
 * @return {number} 一致率（０～１００）
 */
function calculateRouteFamiliarity(route) {
    const segments = appState.frequentSegments;

    if(!route || !route.legs || !segments || segments.length === 0) {
        return 0;
    }

    const SAMPLE_INTERVAL_M = 10;
    const MATCH_THRESHOLD_M = 30;

    let totalDistance = 0;
    let familiarDistance = 0;

    for (const leg of route.legs) {
        for (const step of leg.steps) {
            const path = step.path || [];

            for (let i = 1; i < path.length; i++) {
                const p1 = toLatLngObj(path[i - 1]);
                const p2 = toLatLngObj(path[i]);

                if (!p1 || !p2) continue;

                const distance = getDistanceMeters(p1.lat, p1.lng, p2.lat, p2.lng);

                if(distance <= 0) continue;

                const sampleCount = Math.ceil( distance / SAMPLE_INTERVAL_M );

                const sampleDistance = distance / sampleCount;

                for (let j = 0; j < sampleCount; j++) {
                    const t = (j + 0.5) / sampleCount;

                    const lat = p1.lat + (p2.lat - p1.lat) * t;
                    const lng = p1.lng + (p2.lng - p1.lng) * t;

                    totalDistance += sampleDistance;

                    const isFamiliar = segments.some(segment => {
                        const dist = getDistanceToSegmentMeters(lat, lng, segment.start.lat, segment.start.lng, segment.end.lat, segment.end.lng );

                        return dist <= MATCH_THRESHOLD_M;
                    });

                    if (isFamiliar) {
                        familiarDistance += sampleDistance;
                    }
                } 
            }
        }
    }
    if (totalDistance === 0) return 0;

    return Math.round(
        (familiarDistance / totalDistance) * 100
    );
}

/**
 * 円方式で習熟地点を判定する
 * 同じ走行で同じメッシュを通っても1回として数える
 */
function calculateFrequentPoints(trackGroups) {
    const GRID_SIZE_M = 20;
    const MIN_VISITS = 3;

    const gridMap = new Map();

    for (const trackPoints of trackGroups.values()) {
        const visitedCells = new Set();

        for (const point of trackPoints) {
            const lat = point.lat;
            const lon = point.lon;

            const latGrid = Math.floor(
                (lat * 111320) / GRID_SIZE_M
            );

            const lonGrid = Math.floor(
                (lon * 111320 * Math.cos(lat * Math.PI / 180)) / GRID_SIZE_M
            );

            const key = `${latGrid}, ${lonGrid}`;

            if (visitedCells.has(key)) continue;

            visitedCells.add(key);

            if (!gridMap.has(key)) {
                gridMap.set(key, { lat,lng: lon, count: 0});
            }
            gridMap.get(key).count++;
        }
    }
    return Array.from(gridMap.values()).filter(point => point.count >= MIN_VISITS);
}

/**
 * 円方式と線分方式を組み合わせて、
 * 短い途切れを習熟区間として補完する
 */
function buildFamiliarBridges(segments, frequentPoints) {
    //補完条件
    const MAX_GAP_M = 35;
    const MIN_GAP_M = 5;
    const MAX_ANGLE_DEG = 25;
    const MAX_LATERAL_M = 7;
    const CIRCLE_RADIUS_M = 20;
    const CELL_SIZE_M = 40;

    const bridges = [];

    if (!segments?.length || !frequentPoints?.length) {
        return bridges;
    }

    const refLat = segments[0].start.lat;
    const lonScale = 111320 * Math.cos(refLat * Math.PI / 180);

    const toXY = p => ({
        x: p.lng * lonScale,
        y: p.lat * 111320
    });

    const cellKey = (x, y) =>  `${Math.floor(x / CELL_SIZE_M)},${Math.floor(y / CELL_SIZE_M)}`;

    const subtract = (a, b) => ({
        x: a.x - b.x,
        y: a.y - b.y
    });

    const length = v => Math.hypot(v.x, v.y);

    const angle = (a, b) => {
        const la = length(a);
        const lb = length(b);

        if (la < 1 || lb < 1) return 180;

        const cosine = Math.max(-1, Math.min(
            1,
            (a.x * b.x + a.y * b.y) / (la * lb)
        ));
        return Math.acos(cosine) * 180 / Math.PI;
    };

    const lateralDistance = (a, b) => {
        const lb = length(b);
        if (lb < 1) return Infinity;

        return Math.abs(
            a.x * b.y - a.y * b.x
        ) / lb;
    };

    //円方式の習熟地点を空間メッシュに登録
    const circleIndex = new Map();

    for (const point of frequentPoints) {
        const xy = toXY(point);
        const key = cellKey(xy.x, xy.y);

        if (!circleIndex.has(key)) {
            circleIndex.set(key, []);
        }

        circleIndex.get(key).push(xy);
    }

    //指定位置が円方式の習熟範囲内か
    function insideFamiliarCircle(x, y) {
        const cx = Math.floor(x / CELL_SIZE_M);
        const cy = Math.floor(y / CELL_SIZE_M);
        
        for (let ix = cx - 1; ix <= cx + 1; ix++) {
            for (let iy = cy - 1; iy <= cy + 1; iy++) {
                const nearby = circleIndex.get(`${ix},${iy}`) || [];
                for (const p of nearby) {
                    if (Math.hypot(p.x - x, p.y - y) <= CIRCLE_RADIUS_M) {
                        return true;
                    }
                }
            }   
        }

        return false;
    }

    //各線分の両端を取得
    const ends = [];
    const endIndex = new Map();

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];

        for (const [point, inner] of [
            [segment.start, segment.end],
            [segment.end, segment.start]
        ]) {
            const endpoint = {
                id: ends.length,
                segmentIndex: i,
                point, 
                xy: toXY(point),
                innerXY: toXY(inner)
            };

            ends.push(endpoint);

            const key = cellKey(endpoint.xy.x, endpoint.xy.y);

            if (!endIndex.has(key)) {
                endIndex.set(key, []);
            }

            endIndex.get(key).push(endpoint);
        }
    }
    const candidates = [];

    //近くの端点だけを比較
    for (const a of ends) {
        const cx = Math.floor(a.xy.x / CELL_SIZE_M);
        const cy = Math.floor(a.xy.y / CELL_SIZE_M);

        for (let ix = cx - 1; ix <= cx + 1; ix++) {
            for (let iy = cy - 1; iy <= cy + 1; iy++) {
                const nearby = endIndex.get(`${ix},${iy}`) || [];

                for (const b of nearby) {
                    if (b.id <= a.id) continue;

                    if (a.segmentIndex === b.segmentIndex) {
                        continue;
                    }

                    const ab = subtract(b.xy, a.xy);
                    const gap = length(ab);

                    if (gap <MIN_GAP_M || gap > MAX_GAP_M) { continue; }

                    //a側から隙間へ進む方向
                    const directionA = subtract(a.xy, a.innerXY);

                    //隙間からｂ側へ進む方向
                    const directionB = subtract(b.innerXY, b.xy);

                    //接続方向を確認
                    if (angle(directionA, ab) > MAX_ANGLE_DEG || angle(directionB, ab) > MAX_ANGLE_DEG) {
                        continue;
                    }

                    //横方向のずれを確認
                    if ( lateralDistance(directionA, ab) > MAX_LATERAL_M || lateralDistance(directionB, ab) > MAX_LATERAL_M) {
                        continue;
                    }

                    //隙間全体が円方式の習熟範囲内か
                    const sampleCount = Math.max(
                        2, Math.ceil(gap / 5)
                    );

                    let covered = true;

                    for (let k = 0; k <= sampleCount; k++) {
                        const t = k / sampleCount;

                        const x = a.xy.x + ab.x * t;
                        const y = a.xy.y + ab.y * t;

                        if (!insideFamiliarCircle(x, y)) {
                            covered = false;
                            break;
                        }
                    }

                    if (!covered) continue;

                    candidates.push({ a, b, gap });
                }
            }
        }
    }

    //距離が近い候補を優先
    candidates.sort((a, b) => a.gap - b.gap);

    const usedEnds = new Set();

    for (const candidate of candidates) {
        const { a, b } = candidate;

        if (usedEnds.has(a.id) || usedEnds.has(b.id)) { continue; }

        usedEnds.add(a.id);
        usedEnds.add(b.id);

        bridges.push({
            start: {...a.point},
            end:{...b.point},
            count: 0,
            recentCount: 0,
            monthlyCounts: {},
            inferred: true
        });
    }
    return bridges;
}