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

    if (!currentLatLon) {
        logMessage("現在地の取得に失敗しました");
        return;
    }

    const { lat: currentLat, lng: currentLon } = currentLatLon;
    const destinationLatLon = await getCoordinatesFromPlace(destinationPlace);

    if (!destinationLatLon) {
        logMessage("\nエラー:目的地の座標を獲得できませんでした");
        return;
    }

    drawMap();

    if (isOutsideRoute(currentLat, currentLon)) {
        logMessage("経路外です");
        displayRoute(currentLatLon, destinationLatLon);

        updateNavDisplay("ルートを確認してください", "開始ボタンを押すと案内を始めます", "#2c3e50");
    } else {
        logMessage("経路内です");
        
        updateNavDisplay("よく通る道です", "案内を休止しています")

        startLocationTracking();
    }
}