let currentStepIndex = 0;
let steps = [];
let stepPolyline = null;
let navigationActive = false;

/**
 * 経路ナビを開始・再開する
 * @param {object} leg - route.legs[0]
 * @param {boolean} resume -再開かどうか
 */
function startStepNavigation(leg, resume = false) {
    if (!leg || !leg.steps) {
        logMessage("ナビ開始エラー：leg情報が不足しています");
        return;
    }
    
    steps = leg.steps;

    if (!resume) {
        currentStepIndex = 0;
        logMessage("ナビを最初から開始します");
    } else {
        logMessage(`ナビをステップ ${currentStepIndex + 1} から再開します`);
    }
    
    navigationActive = true;

    if (window.lastDirectionsResponse && window.lastDirectionsResponse.routes && window.lastDirectionsResponse.routes.length > 0) {
        const bounds = window.lastDirectionsResponse.routes[0].bounds;
        if (bounds && typeof map.fitBounds === 'function') map.fitBounds(bounds);
    } else {
        console.warn("DirectionsAPIレスポンスからboundsが取れませんでした");

    }
    logMessage(`全 ${steps.length} ステップ中、現在 ${currentStepIndex + 1} ステップ目`);
    showCurrentStep();
}

/**
 * 現在のステップ情報をマップとログに表示
 */
function showCurrentStep() {
    if (!navigationActive || currentStepIndex >= steps.length) {
        const finishMsg = "目的地周辺に到着しました。案内を終了します。";
        logMessage(finishMsg);
        speak(finishMsg);
        logMessage("ナビ終了");
        navigationActive = false;
        return;
    }
    
    const step = steps[currentStepIndex];
    const instruction = step.instructions.replace(/<[^>]*>/g, "");
    const distance = step.distance.text;
    const duration = step.duration.text;

    logMessage(`案内: ${instruction.replace(/<[^>]*>/g, "")}`);
    updateNavDisplay(instruction, `あと ${distance}`, "#333");

    if (stepPolyline) {
        stepPolyline.setMap(null);
        stepPolyline = null;
    }

    let startLoc = step.start_location;
    let endLoc = step.end_location;

    const toLatLngObj = (loc) => {
        if (!loc) return null;
        let lat, lng;
        if (typeof loc.lat === 'function') lat = loc.lat();
        else if (typeof loc.lat === "number") lat = loc.lat;


        if (typeof loc.lng === 'function') lng = loc.lng();
        else if (typeof loc.lng === 'number') lng = loc.lng;
        
        if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
        return null;
    };

    startLoc = toLatLngObj(startLoc);
    endLoc = toLatLngObj(endLoc);

    const path = [];
    if (startLoc) path.push(startLoc);
    if (endLoc) path.push(endLoc);

    if (path.length > 0) {
        stepPolyline = new google.maps.Polyline({
            path,
            map,
            strokeColor: "#3498db",
            strokeOpacity: 0.8,
            strokeWeight: 6
        });
    }

    const speechText = `${distance}先、${instruction}`;
    speak(speechText);

    //if (startLoc) map.panTo(startLoc);
    //map.setZoom(17);
}

/**
 * 現在地が現在のステップの終点に近づいたかチェックし、進行を促す
 * @param {{lat: number, lng: number}} currentLocation　現在地の座標
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
        logMessage("ステップ終点の位置が取得できません")
        return;
    }

    const distanceToEnd = getDistanceMeters(
        currentLocation.lat, currentLocation.lng,
        endLat, endLng
    );

    const NEXT_STEP_THRESHOLD_M = 20;

    if (distanceToEnd > NEXT_STEP_THRESHOLD_M || currentStepIndex % 5 === 0) {
        logMessage(`[ナビ中]ステップ　${currentStepIndex + 1} の終点まで：　${distanceToEnd.toFixed(1)} m`);
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

async function handleStartNavigation() {
    await requestDeviceOrientation();
    startStepNavigation();
}

/**
 * 現在地から現在ステップ終点までの距離を表示更新
 * @param {{Lat:number,Lng:number}} currentLocation
 */
function updateRemainingDistance(currentLocation) {
    if (!navigationActive) return;
    if (currentStepIndex >= steps.length) return;

    const step = steps[currentStepIndex];
    if (!step || !step.end_location) return;

    let endLat, endLng;

    if (typeof step.end_location.lat === 'function') {
        endLat = step.end_location.lat();
        endLng = step.end_location.lng();
    } else {
        endLat = step.end_location.lat;
        endLng = step.end_location.lng;
    }

    const updateRemainingMeters = getDIstanceMeters(
        currentLocation.lat,
        currentLocation.lng,
        endLat,
        endLng
    );

    const instruction = step.instractions.replace(/<[^>]*>/g, "");

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