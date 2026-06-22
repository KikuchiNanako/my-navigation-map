//const { version } = require("react");

let currentStepIndex = 0;
let steps = [];
let navigationActive = false;
let routePolylines = [];
let activeTraveledPolyline = null;
let activeRemainingPolyline = null;

/**
 * 経路ナビを開始・再開する
 * @param {object} leg - route.legs[0]
 */
function startStepNavigation(leg, resume = false) {
    if (!leg || !leg.steps) {
        logMessage("ナビ開始エラー：leg情報が不足しています");
        return;
    }
    
    steps = leg.steps;
    currentStepIndex = 0;
    navigationActive = true;

    clearRoutePolylines();

    if (typeof clearAlternativePolylines === 'function') {
        clearAlternativePolylines();
    }

    drawAllRouteSteps();

    const listElement = document.getElementById("routeStepsList");
    if (listElement) {
        const items = listElement.getElementsByTagName("li");
        for (let i = 0; i < items.length; i++) {
            items[i].id = `step-item-${i}`;
        }
    }

    if(window.lastDirectionsResponse && window.lastDirectionsResponse.routes && window.lastDirectionsResponse.routes.length > 0) {
        const bounds = window.lastDirectionsResponse.routes[0].bounds;
        if (bounds && typeof map.fitBounds === 'function') map.fitBounds(bounds);
    } else {
        console.warn("DirectionsAPIレスポンスからboundsが取れませんでした");
    }
    logMessage(`ナビ開始： ${steps.length}ステップ`);
    showCurrentStep();
}

/**
 * ルートの全てのステップを最初に青い線で描画する
 */
function drawAllRouteSteps() {
    clearRoutePolylines();

    if (!steps || steps.length === 0) return;

    steps.forEach((step, index) => {
        let path = step.path;
        if (!path) {
            const startLoc = toLatLngObj(step.start_location);
            const endLoc = toLatLngObj(step.end_location);
            path = (startLoc && endLoc) ? [startLoc, endLoc] : [];
        }

        const polyline = new google.maps.Polyline({
            path: path,
            map: map,
            strokeColor: "#0000FF",
            strokeOpacity: 0.7,
            strokeWeight: 6
        });

        polyline.stepIndex = index;
        polyline.rawPath = path;

        routePolylines.push(polyline);
    });
}

/**
 * [1メートル単位で塗りつぶすコアロジック]
 * 現在地を基に現在のステップの線を走破済みと未走行にリアルタイム分割する
 * @param {{lat: number, lng: number}} currentLocation -現在地の座標
 * @param {number} currentIdx -現在のステップ番号
 */
function updateFineGrainedRouteColor(currentLocation, currentIdx) {
    if (!routePolylines || routePolylines.length === 0) return;


    const ON_ROUTE_THRESHOLD_M = 15;
    let isOffRoute = false;

    const currentPolyline = routePolylines.find(p => p.stepIndex === currentIdx);
    if (currentPolyline && currentPolyline.rawPath && currentPolyline.rawPath.length > 0) {
        let minDistanceToLine = Infinity;
        currentPolyline.rawPath.forEach((vertex) => {
            const vLat = (typeof vertex.lat === 'function') ? vertex.lat() : vertex.lat;
            const vLng = (typeof vertex.lng === 'function') ? vertex.lng() : vertex.lng;
            const dist = getDistanceMeters(currentLocation.lat, currentLocation.lng, vLat, vLng);
            if (dist < minDistanceToLine) {
                minDistanceToLine = dist;
            }
        });

        if (minDistanceToLine >= ON_ROUTE_THRESHOLD_M) {
            isOffRoute = true;
        }
    }

    routePolylines.forEach((polyline) => {
        if (polyline.stepIndex < currentIdx) {
            polyline.setOptions({
                strokeColor: "#888888",
                strokeOpacity: 0.4,
                strokeWeight: 4,
            });
            polyline.setMap(map);
        }
        else if (polyline.stepIndex > currentIdx) {
            polyline.setOptions({
                strokeColor: "#0000ff",
                strokeOpacity: 0.7,
                strokeWeight: 6,
            });
            polyline.setMap(map);
        }
        else if (polyline.stepIndex === currentIdx) {
            if (isOffRoute) {
                if (activeTraveledPolyline) activeTraveledPolyline.setMap(null);
                if (activeRemainingPolyline) activeRemainingPolyline.setMap(null);

                polyline.setOptions({
                    strokeColor: "#0000ff",
                    strokeOpacity: 0.7,
                    strokeWeight: 6,
                });
                polyline.setMap(map);
                return;
            }

            polyline.setMap(null);

            const rawPath = polyline.rawPath;
            if (!rawPath || rawPath.length === 0) return;

            let closestVertexIndex = 0;
            let minDistance = Infinity;

            console.log("探索するパスの長さ:", rawPath.length);
            for (let i = 0; i < rawPath.length; i++) {
                const vertex = rawPath[i];

                const vLat = (typeof vertex.lat === 'function') ? vertex.lat() : vertex.lat;
                const vLng = (typeof vertex.lng === 'function') ? vertex.lng() : vertex.lng; 

                const dist = getDistanceMeters(currentLocation.lat, currentLocation.lng, vLat, vLng);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestVertexIndex = i;
                }
            }
            console.log("計算後の最短距離:", minDistance);

            const traveledCoords = [];
            for (let i = 0; i <= closestVertexIndex; i++) {
                traveledCoords.push(rawPath[i]);
            }

            traveledCoords.push(new google.maps.LatLng(currentLocation.lat,currentLocation.lng));

            const remainingCoords = [new google.maps.LatLng (currentLocation.lat, currentLocation.lng)];
            for (let i = closestVertexIndex + 1; i < rawPath.length; i++) {
                remainingCoords.push(rawPath[i]);
            }

            if (!activeTraveledPolyline) {
                activeTraveledPolyline = new google.maps.Polyline({
                    path: traveledCoords,
                    map: map,
                    strokeColor: "#888888",
                    strokeOpacity: 0.4,
                    strokeWeight: 4,
                });
            } else {
                activeTraveledPolyline.setPath(traveledCoords);
                activeTraveledPolyline.setMap(map);
            }

            if (!activeRemainingPolyline) {
                activeRemainingPolyline = new google.maps.Polyline({
                    path: remainingCoords,
                    map: map,
                    strokeColor: "#0000ff",
                    strokeOpacity: 0.8,
                    strokeWeight: 6,
                });
            } else {
                activeRemainingPolyline.setPath(remainingCoords);
                activeRemainingPolyline.setMap(map);
            }
        }
    });
}

/**
 * 現在のステップインデックスに基づいて、それより前の走破済みルートの色を塗り替える
 * @param {number} currentIndex -　現在案内中のs轍鮒番号
 */
function updateTraveledRouteColor(currentIdx) {
    if (!routePolylines || routePolylines.length === 0) return;

    routePolylines.forEach((polyline) => {
        if (polyline.stepIndex < currentIdx) {
            polyline.setOptions({
                strokeColor: "#7F8c8D",
                strokeOpacity: 0.6,
                strokeWeight: 5,
                zIndex: 1
            });
        }

        else {
            polyline.setOptions({
                strokeColor: "#0000FF",
                strokeOpacity: 0.7,
                strokeWeight: 6,
                zIndex: 2
            });
        }
    });
}

/**
 * 現在のステップ情報をマップとログに表示
 */
function showCurrentStep() {
    if (!navigationActive || currentStepIndex >= steps.length) {
        logMessage("ナビ終了");
        navigationActive = false;
        return;
    }
    
    const step = steps[currentStepIndex];
    const instruction = (step.instructions || "").replace(/<[^>]*>/g, "");
    const distance = step.distance.text;
    const duration = step.duration.text;

    logMessage(`次の案内： ${instruction} (${distance}, ${duration})`);

    let startLoc = toLatLngObj(step.start_location);
    if (startLoc) {
        updateFineGrainedRouteColor(startLoc, currentStepIndex);
    }
    map.setZoom(15);
}

function toLatLngObj(loc) {
    if (!loc) return null;
    let lat, lng;
    if (typeof loc.lat === 'function') lat = loc.lat();
    else if (typeof loc.lat === "number") lat = loc.lat;

    if (typeof loc.lng === 'function') lng = loc.lng();
    else if (typeof loc.lng === 'number') lng = loc.lng;

    if (typeof lat === 'number' && typeof lng === 'number') return {lat, lng};
    return null;
}

function clearRoutePolylines() {
    if (routePolylines && routePolylines.length > 0) {
        routePolylines.forEach(p => p.setMap(null));
    }
    routePolylines = [];

    if (activeTraveledPolyline) {
        activeTraveledPolyline.setMap(null);
        activeTraveledPolyline = null;
    }

    if (activeRemainingPolyline) {
        activeRemainingPolyline.setMap(null);
    }
    activeRemainingPolyline = null;
    console.log("ナビゲーション用ポリラインをすべてクリアしました");
}

/**
 * 現在地から以降のステップの中で最も近いステップを探し、
 * ユーザーが現在のステップから外れたとみなせる場合のみ案内をスキップする
 * @param {{lat: number, lng: number}} currentLocation
 */
function skipToNearestStep(currentLocation) {
    if (!steps || steps.length === 0 || !navigationActive) return;

    const currentStep = steps[currentStepIndex];
    let currentStepPath = currentStep.path || [];
    if (currentStepPath.length === 0) {
        const sLoc = toLatLngObj(currentStep.start_location);
        const eLoc = toLatLngObj(currentStep.end_location);
        currentStepPath = (sLoc && eLoc) ? [sLoc, eLoc] : [];
    }

    let distanceFromCurrentStepLine = Infinity;
    currentStepPath.forEach(vertex => {
        const vLat = (typeof vertex.lat === 'function') ? vertex.lat() : vertex.lat;
        const vLng =(typeof vertex.lng === 'function') ? vertex.lng() : vertex.lng;
        const dist = getDistanceMeters(currentLocation.lat, currentLocation.lng, vLat, vLng);
        if (dist < distanceFromCurrentStepLine) {
            distanceFromCurrentStepLine = dist;
        }
    });

    const ON_ROUTE_THRESHOLD_M = 15;
    if (distanceFromCurrentStepLine < ON_ROUTE_THRESHOLD_M) {
        return;
    }

    let closestStepIndex = currentStepIndex;
    let minDistance = Infinity;
    const SNAP_THRESHOLD_M = 30;

    for (let i = currentStepIndex; i < steps.length; i++) {
        const step = steps[i];
        let path = step.path || [];
        if (path.length === 0) {
            const sLoc = toLatLngObj(step.start_location);
            const eLoc = toLatLngObj(step.end_location);
            path = (sLoc && eLoc) ? [sLoc, eLoc] : [];
        }

        path.forEach((vertex) => {
            const vLat = (typeof vertex.lat === 'function') ? vertex.lat() : vertex.lat;
            const vLng = (typeof vertex.lng === 'function') ? vertex.lng() : vertex.lng;
            const dist = getDistanceMeters(currentLocation.lat, currentLocation.lng, vLat, vLng);
            if (dist < minDistance) {
                minDistance = dist;
                closestStepIndex = i;
            }
        });
    }

    if (minDistance < SNAP_THRESHOLD_M && closestStepIndex > currentStepIndex && minDistance < distanceFromCurrentStepLine) {
        logMessage(`ルート復帰検知：現在のステップから離れたため、案内をスキップします`);
        currentStepIndex = closestStepIndex;
        showCurrentStep();

        updateFineGrainedRouteColor(currentLocation, currentStepIndex);
        
        updateRemainingDistance(currentLocation);

        const nextStepObj = steps[currentStepIndex];
        if (nextStepObj && typeof speakText === 'function') {
            const cleanInstruction = nextStepObj.instructions.replace(/<[^>]*>/g, "");
            speakText(`ルートに復帰しました。次は、${cleanInstruction}です`);
        } 

    }
}

/**
 * 現在地が現在のステップの終点に近づいたかチェックし、進行を促す
 */
function checkStepProgression(currentLocation) {
    if (!steps || steps.length === 0) {
        logMessage("ナビゲーションエラー：ステップ情報がありません");
        return;
    }
    
    if (currentStepIndex >= steps.length) {
        //目的地到着
        if (navigationActive) {
            logMessage("目的地に到着しました");
            navigationActive = false;
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        }
        return;
    } 

    const step = steps[currentStepIndex];
    if (!step || !step.end_location) {
        logMessage("ステップ終点の位置が取得できません");
        return;
    }

    let endLat, endLng;
    if (typeof step.end_location.lat === 'function') {
        endLat = step.end_location.lat();
        endLng = step.end_location.lng();
    } else {
        endLat = step.end_location.lat;
        endLng = step.end_location.lng;
    }

    if (typeof endLat !== "number" || typeof endLng !== "number") {
        logMessage("ステップ終点の位置が取得できません");
        return;
    }
    
    const distanceToEnd = getDistanceMeters(
        currentLocation.lat, currentLocation.lng,
        endLat, endLng
    );

    const NEXT_STEP_THRESHOLD_M = 20;

    if (distanceToEnd > NEXT_STEP_THRESHOLD_M || currentStepIndex % 5 === 0) {
        logMessage(`[ナビ中]ステップ ${currentStepIndex + 1} の終点まで：　${distanceToEnd.toFixed(1)} m`);
    }

    if (distanceToEnd < NEXT_STEP_THRESHOLD_M) {
        logMessage(`== 次のステップへ（終点まで ${distanceToEnd.toFixed(1)} m） ==`);
        nextStep();
    }
}

/**
 * 次のステップに進む（疑似的な移動）
 */
function nextStep() {
    if (!navigationActive) {
        logMessage("ナビが開始されてません");
        return;
    }
    currentStepIndex++;
    showCurrentStep();
}

/**
 * Directions APIの結果を受け取りナビを開始
 * route.check.jsのdesplayRoute()から呼ばれる
 */
function handleRouteForNavigation(route) {
    if (!route || !route.legs || route.legs.length === 0) return;
    const leg = route.legs[0];
    startStepNavigation(leg);
}

/**
 * 現在地から現在ステップ終点までの距離を表示更新
 * @param {{lat:number, lng:number}} currentLocation
 */
function updateRemainingDistance(currentLocation) {
    if (!navigationActive) return;
    if (!steps || currentStepIndex >= steps.length) return;

    const step = steps[currentStepIndex];
    if (!step || !step.end_location) return;

    const endLat = (typeof step.end_location.lat === 'function') ? step.end_location.lat() : step.end_location.lat;
    const endLng = (typeof step.end_location.lng === 'function') ? step.end_location.lng() : step.end_location.lng;

    const remainingMeters = getDistanceMeters(
        currentLocation.lat,
        currentLocation.lng,
        endLat,
        endLng
    );

    const instruction = step.instructions.replace(/<[^>]*>/g, "");

    let distanceText;
    if (remainingMeters >= 1000) {
        distanceText = `${(remainingMeters / 1000).toFixed(1)} km`;
    } else {
        distanceText = `${Math.round(remainingMeters)}m`;
    }

    const isFinalStep = (currentStepIndex === steps.length - 1);

    if (isFinalStep && remainingMeters <= 20) {
        navigationActive = false;

        if (window.navigationTimer) {
            clearInterval(window.navigationTimer);
            window.navigationTimer = null;
        }

        updateNavDisplay("目的地に到着しました");

        const statusLabel = document.getElementById("statusLabel");
        if (statusLabel) {
            statusLabel.innerText = "状態：目的地到着";
        }

        if (typeof speakText === 'function') {
            speakText("目的地に到着しました。ナビゲーションを終了します");
        }

        logMessage("目的地到着。ナビゲーション終了");

        const startBtn = document.getElementById("routestartButton");
        const stopBtn = document.getElementById("stopButton");
        const resumeBtn = document.getElementById("startButton");
        if (startBtn) startBtn.style.display = "block";
        if (stopBtn) stopBtn.style.display = "none";
        if (resumeBtn) resumeBtn.style.display = "none";
    } else {
        updateNavDisplay(
        instruction,
        `あと${distanceText}`,
        "#333"
        );
    }    
}
