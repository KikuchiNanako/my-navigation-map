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

        updateCurrentLocationMarker(originLatLon);

        document.getElementById(`startButton`).style.display = 'block';
        document.getElementById('stopButton').style.display = 'none';

    } catch (e) {
        logMessage(`**致命的エラー発生(rquestRouteDrawing) :** ${e.name}: ${e.message}`);
        console.error("ルート描画中のキャッチされたエラー", e);
    }
    
 }

 //現在地マーカーの位置を更新する
 function updateCurrentLocationMarker(currentLatLon) {
    map.panTo(currentLatLon);

    if (!currentLocationMarker) {
        currentLocationMarker = new google.maps.Marker({
            position: currentLatLon,
            map: map,
            title: '現在地',
            icon: {
                url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png'
            }
        });
        logMessage("現在地マーカーを作成しました");
    } else {
        currentLocationMarker.setPosition(currentLatLon);
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
function startNavigation() {
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

    navigationActive = true;
    logMessage("ナビゲーションを開始します")

    startStepNavigation(route.legs[0]);

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

    //現在地マーカーの更新・作成
    updateCurrentLocationMarker(currentLatLon);

    //ナビゲーションがアクティブな場合のみ案内ロジックを実行
    if (navigationActive) {

        const isOutsideSpecialRoute = isOutsideRoute(currentLatLon.lat, currentLatLon.lng);

        if (isOutsideSpecialRoute) {
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
