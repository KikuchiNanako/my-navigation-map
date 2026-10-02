async function startRouteCheck() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            await DeviceOrientationEvent.requestPermission();
        } catch (e) {
            console.warn("ジャイロセンサーの権限リクエストをスキップしました", e);
        }
    }
    
    if (!appState.gpxProcessed) {
        logMessage("エラー: GPXデータが処理されていません");
        return;
    }

    const destinationPlace = document.getElementById(`destinationInput`).value.trim();
    if (!destinationPlace) {
        logMessage("エラー: 目的地を入力してください");
        return;
    }

    let currentLatLon = await getApproximateLocation();
    
    const renderer = appState.directionsRenderer;

    if(renderer) {
        renderer.setDirections({ routes: [] });
    }

    if (!currentLatLon && appState.allPoints.length > 0) {
        logMessage("現在地の取得に失敗しました");
        currentLatLon = { lat: appState.allPoints[0].lat, lng: appState.allPoints[0].lon };
        } else if (!currentLatLon) {
            logMessage("エラー:現在地を取得できませんでした");
            return;
        }

        const { lat: currentLat, lng: currentLon } = currentLatLon;
        const destinationLatLon = await getCoordinatesFromPlace(destinationPlace);

        if (!destinationLatLon) {
            logMessage("\nエラー:目的地の座標を獲得できませんでした");
            return;
        }

        if (isOutsideRoute(currentLat, currentLon)) {
            logMessage("経路外です");
            displayRoute(currentLatLon, destinationLatLon);
            drawMap();

            updateNavDisplay("ルートを確認してください", "開始ボタンを押すと案内を始めます", "#2c3e50");
        } else {
            logMessage("経路内です");
            drawMap();

            updateNavDisplay("よく通る道です", "案内を休止しています")

            if (appState.watchId === null) {
                appState.watchId = navigator.geolocation.watchPosition(
                    onPositionUpdate,
                    (error) => logMessage(`位置監視エラー: ${error.message}`),
                    {
                        enableHighAccuracy: true,
                        timeout: 5000,
                        maximumAge: 0
                    }
                );
                logMessage("現在地の保存を開始しました");
            }
        }
 }

 function checkCurrentLocation(lat, lon) {
    const outside = isOutsideRoute(lat, lon);
    const isActive = appState.navigationActive;
    const stepIdx = appState.currentStepIndex || 0;

    if (outside && !isActive) {
        logMessage("知らない道に出ました。ナビを開始します");
        startRouteCheck();
    } else if (!outside) {
        logMessage("経路内を走行中");
    }
 
    if (isActive) {
        const currentLocation = { lat, lng: lon };
        if (typeof checkStepProgression === 'function') checkStepProgression(currentLocation);  
        if (typeof updateFineGrainedRouteColor === 'function') updateFineGrainedRouteColor(currentLocation, stepIdx);
        if (typeof updateRemainingDistance === 'function') updateRemainingDistance(currentLocation);
    }
 }


