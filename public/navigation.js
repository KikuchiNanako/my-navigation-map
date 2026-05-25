let currentStepIndex = 0;
let steps = [];
let navigationActive = false;
let routePolylines = [];

/**
 * 経路ナビを開始・再開する
 * @param {object} leg - route.legs[0]
 */
function startStepNavigation(leg, resume = false) {
    if (window.currentSelectedRouteLeg) {
        leg = window.currentSelectefRouteLeg;
    }

    if (!leg || !leg.steps) {
        logMessage("ナビ開始エラー：leg情報が不足しています");
        return;
    }
    
    steps = leg.steps;
    surrentStepIndex = 0;
    navigationActive = true;

    clearRoutePolylines();

    drawAllRouteSteps();

    if(window.lastDirectionsResponse && window.lastDirectionsResponse.routes && window.lastDirectionsResponse.routes.length > 0) {
        const bounds = window.lastDirectionsResponse.routes[0].bounds;
        if (bounds && typeof map.fitBounds === 'function') map.fitBounds(bounds);
    } else {
        console.marn("DirectionsAPIレスポンスからboundsが取れませんでした");
    }
    logMessage(`ナビ開始： ${steps.length}ステップ`);
    showCurrentStep();
}

/**
 * ルートの全てのステップを最初に青い線で描画する
 */
function drawAllRouteSteps() {
    steps.forEach((step, index) => {
        const path = step.path || [toLatLngObj(step.start_location), toLatLngObj(step.end_location)];

        const polyline = new google.maps.Polyline({
            path: path,
            map: map,
            strokeColor: "#0000FF",
            strokeOpacity: 0.7,
            strokeWeight: 6
        });

        routePolylines.push(polyline);
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

    routePolylines.forEach((polyline, index) => {
        if (index < currentStepIndex) {
            polyline.setOptions({
                strokeColor: "#888888",
                strokeOpacity: 0.4,
                strokeWeight: 4
            });
        } else {
            polyline.setOptions({
                strokeColor: "#0000FF",
                strokeOpacity: 0.7,
                strokeWeight: 6
            });
        }
    });

    let startLoc = toLatLngObj(step.start_location);
    if (startLoc) {
        map.panTo(startLoc);
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
    routePolylines.forEach(p => p.setMap(null));
    routePolylines = [];
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
 * @param {{Lat:number,Lng:number}} currentLocation
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

    updateNavDisplay(
        instruction,
        `あと${distanceText}`,
        "#333"
    );
}
