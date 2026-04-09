/**
  * プレース名から座標を取得する
  * @param {string} PlaceName
  * @returns {Promise<{lat: number, lng: number} | null>}
  */
 function getCoordinatesFromPlace(placeName) {
    return new Promise((resolve) => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: placeName }, (results, status) => {
            if (status === google.maps.GeocoderStatus.OK && results.length > 0) {
                const location = results[0].geometry.location;
            const address = results[0].formatted_address;
            logMessage(`Google Geocoding success: ${address}`);
            resolve({ lat: location.lat(), lng: location.lng() });
            } else {
                logMessage(`Geocoding miss: '${placeName}'の座標が見つかりませんでした (${status})`);
                resolve(null);
            } 
        });
    });
 }

 /**
  * ブラウザのGoolocationAPIで現在地を取得
  * @returns {Promise<{lat: number, lng: number} | null>}
  */
 function getApproximateLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            logMessage("ブラウザがGeolocationをサポートしてません");
            return resolve(null);
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                logMessage(`Geolocation success: 緯度=${lat.toFixed(5)}, 経度=${lng.toFixed(5)}`);
                resolve({ lat, lng });
            },
            (error) => {
                logMessage(`Geolocation error: ${error.message}. (コード: ${error.code})`);
                resolve(null);
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }
        );
    });
 }

 /**
  * Google Geolocation APIを使って位置を取得する
  * @returns {promise<{lat: number, lng: number} | null>}
  */
async function getGoogleGeolocation() {

    const apiKey = window.MAPS_API_KEY;

    if (!apiKey) {
        logMessage("エラー：APIキーが利用できません");
        return null;
    }

    try {
        const response = await fetch(
            `https://www.googleapis.com/geolocation/v1/geolocate?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json"},
                body: JSON.stringify({})
            }
        );

        const data = await response.json();

        if (response.status !== 200) {
            logMessage(`Google GeolocationAPI request failed: Status=${response.status}, Error=${data.error ? data.error.message : 'Unknown'}`);
            return null;
        }

        if (data && data.location) {
            logMessage(`Google GeolocationAPI success: 緯度=${data.location.lat}, 経度=${data.location.lng}`);
            return { lat: data.location.lat, lng: data.location.lng };
        } else {
            logMessage("Google GeolocationAPI error: レスポンスにlocationがありません");
            return null;
        }
    } catch (err) {
        logMessage("Google GeolocationAPI 通信エラー: " + err);
        return null;
    }
}

/**
 * 位置情報を取得する（Google APIの順で試す）
 * @returns {promise<{lat: number, lng: number} | null>}
 */
async function getHybridLocation() {
    logMessage("位置情報取得")

    const browserLocation = await getApproximateLocation();
    if (browserLocation) {
        logMessage("ブラウザのGeolocationで位置情報を取得しました");
        return browserLocation;
    }

    const googleLocation = await getGoogleGeolocation();
    if (googleLocation) {
        return googleLocation;
    }

    logMessage("すべての方法で位置情報取得に失敗しました");
    return null;
}

 /**
  * 現在地と目的地からルートを計算し、地図に描画する
  */
 async function requestRouteDrawing() {
    logMessage("ルート描画を開始します");

    try {
        const destinationInput = document.getElementById('destinationInput');
    
        if (!destinationInput) {
            logMessage("致命的エラー:目的地を入力してください");
            return;
        }

        const rawValue = destinationInput.value;

        if (rawValue === undefined || rawValue === null) {
            logMessage("致命的エラー２");
            return;
        }

        const destinationPlace = String(rawValue).trim();
        if (!destinationPlace) {
            logMessage("エラー：目的地を入力してください");
            return;        
        }

        const originLatLon = await getHybridLocation();
        if (!originLatLon) {
            logMessage("エラー：現在地を取得できません");
            return;
        }

        logMessage(`デバッグ：現在地取得成功 - 緯度： ${originLatLon.lat.toFixed(5)}, 経度： ${originLatLon.lng.toFixed(5)}`);

        const destinationLatLon = await getCoordinatesFromPlace(destinationPlace);
        if (!destinationLatLon) {
            logMessage("エラー：目的地の座標を取得できませんでした");
            logMessage(`デバッグ：Geocoding失敗 - 目的地名： '${destinationPlace}'`);
            return;
        }
    
        logMessage(`デバッグ：目的地座標取得成功 - 緯度： ${destinationLatLon.lat.toFixed(5)}, 経度： ${destinationLatLon.lng.toFixed(5)}`);

        displayRoute(originLatLon, destinationLatLon);

        logMessage("ルート描画が完了しました");

        const isOutsideInitial = isOutsideRoute(originLatLon.lat, originLatLon.lng);
        updateCurrentLocationMarker(originLatLon, 0, isOutsideInitial);

        document.getElementById('routestartButton').style.display = 'block';
        document.getElementById(`startButton`).style.display = 'none';
        document.getElementById('stopButton').style.display = 'none';

    } catch (e) {
        logMessage(`**致命的エラー発生(rquestRouteDrawing) :** ${e.name}: ${e.message}`);
        console.error("ルート描画中のキャッチされたエラー", e);
    }
    
 }


 /*
 function startNavigationTracking() {
    if (navigationTimer !== null) {
        clearInterval(navigationTimer);
    }

    navigationTimer = setInterval(async () => {

        const googlePos = await getGoogleGeolocation();
        if (!googlePos) {
            logMessage("Google Geolocation API が現在地を取得できません");
            return;
        }

        onPositionUpdate({
            coords: {
                latitude: googlePos.lat,
                longitude: googlePos.lng
            }
        });
    }, 3000);
 }
*/

 /**
 * 現在地監視を開始し、ナビゲーションのコアロジックを駆動する
 */
async function startNavigation() {
    if ( typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', updateHeadingHandler, true);
                logMessage("向きセンサーの権限を取得しました");
            } else {
                logMessage("方向情報の取得が拒否されました");
            }
        } catch (e) {
            logMessage("方向情報の権限リクエスト中にエラーが発生しました");
        }
    } else {
            const eventname = ('ondeviceorientationabsolute' in window) ? 'deviceorientationabsolute' : 'deviceorientation';
            window.addEventListener(eventname, updateHeadingHandler, true);
            logMessage("向きセンサーを開始しました");
    }


    if (!window.lastDirectionsResponse) {
        logMessage("エラー：事前にルートを描画してください");
        return;
    }

    const response = window.lastDirectionsResponse;
    if (!response.routes || response.routes.length === 0) {
        logMessage("エラー：ルート情報がありません");
        return;
    }

    const route = response.routes[0];
    if (!route.legs || route.legs.length === 0) {
        logMessage("ナビ開始エラー：ルートにレッグ情報がありません");
        return;
    }

    const isResuming = (typeof currentStepIndex !== 'undefined' && currentStepIndex > 0);
    logMessage(isResuming ? "ナビゲーションを再開します" : "ナビゲーションを開始します");

    navigationActive = true;
    //logMessage("ナビゲーションを開始します")

    startStepNavigation(route.legs[0], isResuming);

    /*既存のナビゲーションがあれば停止
    if (watchId !== null) {
        logMessage("ナビゲーションはすでに開始されています");
    }


    watchId = navigator.geolocation.watchPosition(
        onPositionUpdate,
        (error) => logMessage(`Geolocation監視エラー： ${error.message}`),
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }    
    );
    */

    if (watchId === null) {
        watchId = navigator.geolocation.watchPosition(
            onPositionUpdate,
            (error) => logMessage(`Geolocation監視エラー: ${error.message}`),
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
        logMessage("ブラウザによるナビゲーション監視を開始します");
    } else {
        logMessage("ナビゲーション監視はすでに開始されています");
    }
        
    document.getElementById('routestartButton').style.display = 'none';
    document.getElementById('startButton').style.display = 'none';
    document.getElementById('stopButton').style.display = 'block';

}

/**
 * Geolocation 監視を停止し、ナビゲーション状態をリセットする
 */
function stopNavigation() {
    if (navigationTimer !== null) {
        clearInterval(navigationTimer);
        navigationTimer = null;
        logMessage("ナビゲーションを停止しました");
    }

    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        logMessage("ブラウザの監視を停止しました");
    }

    //ナビゲーション状態をリセット
    navigationActive = false;
    logMessage("ナビゲーション案内を停止しました");

    //ボタンの表示を切り替える
    document.getElementById('routestartButton').style.display = 'none';
    document.getElementById('startButton').style.display = 'block';
    document.getElementById('stopButton').style.display = 'none';
}


/**
 * 位置情報が更新されるたびに実行されるナビゲーションのコアロジック
 * @param {GeolocationPosition} position
 */
async function onPositionUpdate(position) {
    const currentLatLon = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
    };

    //経路外かどうかを判定
    const isOutside = isOutsideRoute(currentLatLon.lat, currentLatLon.lng);

    const statusLabel = document.getElementById(`statusLabel`);
    if (statusLabel) {
        if (isOutside) {
            statusLabel.innerText = "状態：【経路外】ルート検索を実行します";
            statusLabel.style.color = "red";
        } else {
            statusLabel.innerText = "状態；【経路内】";
            statusLabel.style.color = "green";
        }
    }

    //判定結果に応じて色を決める
    updateCurrentLocationMarker(currentLatLon, 0, isOutside);

    //ナビゲーションがアクティブな場合のみ案内ロジックを実行
    if (navigationActive) {
        if (isOutside) {
            logMessage("ナビゲーション案内実行中:ルート外です");

            if (typeof checkStepProgression === 'function') {
                checkStepProgression(currentLatLon);
            }
        } else {
            logMessage("ナビ案内抑制中：経路内にいます");
        }
    } else {
        logMessage("現在地を追跡中ですがナビゲーションは停止中");
    }
}

 /**
  * 現在地マーカーを更新し、向きを反映させる
  * @param {object} currentLatLon -{lat, lng}
  * @param {number} heading -向き （０～３６０度）
  * @param {boolean} isOutside - 経路外かどうか
  */
 function updateCurrentLocationMarker(currentLatLon, heading = 0, isOutside = false) {
    map.panTo(currentLatLon);

    const fillColor = isOutside ? '#FF0000' : "#4285F4";

    if (!currentLocationMarker) {
        currentLocationMarker = new google.maps.Marker({
            position: currentLatLon,
            map: map,
            title: '現在地',
            icon: {
                path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 6,
                fillColor: fillColor,
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: "white",
                rotation: heading
            }
        });
        logMessage("現在地マーカーを作成しました");
    } else {
        currentLocationMarker.setPosition(currentLatLon);

        const icon = currentLocationMarker.getIcon();
        icon.fillColor = fillColor;
        icon.rotation = heading;
        currentLocationMarker.setIcon(icon);
    }

    if (navigationActive) {
        map.setHeading(heading);
    }
 }

/*
 window.addEventListener('deviceorientationabsolute', (event) => {
    let heading = 0;
    if (event.webkitCompassHeading) {
        heading = event.webkitCompassHeading;
    } else if (event.absolute) {
        heading = 360 - event.alpha;
    }
    
    if (currentLocationMarker) {
        const icon = currentLocationMarker.getIcon();
        if (icon) {
            icon.rotation = heading;
            currentLocationMarker.setIcon(icon);
        }
    }
}, true);

*/


/*
async function requestDeviceOrientation () {
    if ( typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', updateHeadingHandler, true);
                logMessage("向きセンサーの権限を取得しました");
            } else {
                logMessage("方向情報の取得が拒否されました");
            }
        } catch (e) {
            logMessage("方向情報の権限リクエスト中にエラーが発生しました");
        }
    } else {
            const eventname = ('ondeviceorientationabsolute' in window) ? 'deviceorientationabsolute' : 'deviceorientation';
            window.addEventListener(eventname, updateHeadingHandler, true);
            logMessage("向きセンサーを開始しました");
    }
}
*/

/**
 * 実際にマーカーを回転させる処理
 */
function updateHeadingHandler(event) {
    let heading = null;

    if (event.webkitCompassHeading) {
        heading = event.webkitCompassHeading;
    } else if (event.absolute && event.alpha !== null) {
        heading = 360 - event.alpha;
    } else if (event.alpha !== null) {
        heading = 360 - event.alpha;
    }


    if (heading !== null ) {
        if (currentLocationMarker) {
            const icon = currentLocationMarker.getIcon();
            if (icon) {
                icon.rotation = heading;
                currentLocationMarker.setIcon(icon);
            }
        }

        if (window.map && typeof window.map.setHeading === 'function' && navigationActive) {
            window.map.setHeading(heading);
        }

    }
}