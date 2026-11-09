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

            //支店と終点から区間を識別するキーを作成
            //逆方向に通った場合も同じ区間として扱う
            const segmentKey = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;

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
        }
    }
    

    //====頻出区間====
    appState.frequentSegments = Array.from(segmentCountMap.values()).filter(segment => 
        segment.recentCount >= 5 ||
        Object.values(segment.monthlyCounts).some(count => count >= 20)
    );

    //円方式と線分方式を組み合わせて短い隙間を補完する
    appState.bridgeSegments = buildFamiliarBridges(
        appState.frequentSegments,
        appState.frequentPoints
    );

    //補完した区間を習熟区間に追加
    appState.frequentSegments.push(...appState.bridgeSegments);

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
function buildFamiliarBridges(segmets, frequentPoints) {
    //補完条件
    const MAX_GAP_M = 35;
    const MIN_GAP_M = 5;
    const MAX_ANGLE_DEG = 25;
    const MAX_LATERAL_M = 7;
    const CIRCLE_RADIUS_M = 20;

    const bridges = [];
    if (!segments?.length || !frequentPoints?.length) {
        return bridges;
    }

    //各線分の両端を取得
    const ends = [];

    for (let i = 0; i < segments.length; i++) {
        const s = segmets[i];

        ends.push({
            point: s.start,
            inner: s.end,
            segmentIndex: i
        });

        ends.push({
            point: s.end,
            inner: s.start,
            segmentIndex: i
        });
    }
    const used = new Set();
    const candidates = [];

    //緯度経度をメートル単位のベクトルに変換
    const vecter = (from, to) => {
        const scale = Math.cos(
            ((from.lat + to.lat) / 2) * Math.PI / 180
        );

        return [
            (to.lng - from.lng) * 111320 * scale,
            (to.lat - from.lat) * 111320
        ];
    };
    
    //２つのベクトルの角度を計算
    const angle = (u, v) => {
        const nu = Math.hypot(...u);
        const nv = Math.hypot(...v);

        if (nu < 1 || nv < 1) return 180;

        const cos = Math.max( -1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (nu * nv)));

        return Math.acos(cos) * 180 / Math.PI;
    };

    //swン分同士の接続候補を探す
    for (let i = 0; i < ends.length; i++) {

        const a = ends[i];

        for (let j = i + 1; j < ends.length; j++) {
            const a = ends[i];

            for (let j = i + 1; j < ends.length; j++) {
                const b = ends[j];

                //同じ線分の端点同士は対象外
                if (a.segmentIndex === b.segmentIndex) {
                    continue;
                }
                const gap = getDistanceMeters(
                    a.point.lat,
                    a.point.lng,
                    b.point.lat,
                    b.point.lng
                );

                //隙間の距離を確認
                if (gap < MIN_GAP_M || gap > MAX_GAP_M) {
                    continue;
                }

                const ab = vector(a.point, b.point);
                const outA = vecter(a.inner, a.point);
                const outB = vecter(b.point, b.inner);

                //前後の線分がほぼ同じ方向か確認
                if (angle(outA, ab) > MAX_ANGLE_DEG || angle(outB, ab) > MAX_ANGLE_DEG) {
                    continue;
                }

                //横方向のずれを計算
                const crossDistance = (v, w) => {
                    return Math.abs(
                        v[0] * w[1] - v[1] * w[0]
                    ) / Math.hypot(...w);
                };

                if (crossDistance(outA, ab) > MAX_LATERAL_M || crossDistance(outB, ab) > MAX_LATERAL_M) {
                    continue;
                }

                //隙間を５ｍ感覚で調べる
                const samples = Math.max(2, Mathceol(gap / 5));

                let covered = true;

                for (let k = 0; k <= samples; k++) {
                    const t = k / samples;

                    const lat = a.point.lat + (b.point.lat - a.point.lat) * t;
                    const lng = a.point.lng + (b.point.lng - a.point.lng) * t;

                    //円方式の習熟範囲に入ってるか
                    const insideCircle = frequentPoints.some(p => getDistanceMeters(lat, lng, p.lat, p.lng) <= CIRCLE_RADIUS_M);

                    if (!insideCircle) {
                        covered = false;
                        break;
                    }
                }
                if (covered) { candidates.push({i, j, gap, a,b});
                }
            }
        }
        //距離が近い候補を優先
        candidates.sort((a, b) => a.gap - b.gap);

        for (const c of candidates) {
            //同じ端点を複数回使用しない
            if (used.has(c.i) || used.has(c.j)) { continue; }

            used.add(c.i);
            used.add(c.j);

            bridges.push({
                start: {...c.a.point},
                end:{...c.b.point},
                count: 0,
                recentCount: 0,
                monthlyCounts: {},
                inferred: true
            });
        }
        return bridges;
    }
}