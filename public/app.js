/**
 * アプリのメインエントリーポイント＆初期化管理
 */

//グローバル状態管理オブジェクト（必要最小限のグローバル共有）
var map = null;
var directionsService = null;
var directionsRenderer = null;
var frequentCircles = [];
var currentLocationMarker = null;
var watchId = null;
var pathLog = [];
var navigationTimer = null;
var isUserInteracting = false;
var interactionTimeout = null;
var destinationMarker = null;
var lastHeading = 0;
var markerAnimationId = null;
var targetLat = null;
var targetLng = null;
var targetHeading = null;
var currentDisplayedLat = null;
var currentDisplayedLng = null;
var currentDisplayedHeading = null;
var allPoints = [];
var frequentPoints = [];
var gpxProcessed = false;
/*
window.appState = {
    allPoints: [],
    frequentPoints: [],
    map: null,
    gpxProcessed: false,
    directionsService: null,
    directionsRenderer: null,
    frequentCircles: [],
    currentLocationMarker: null,
    watchId: null,
    pathLog: [],
    navigationTimer: null,
    isUserInteracting: false,
    interactionTimeout: null,
    destinationMarker: null,
    lastHeading: 0,
    markerAnimationId: null,
    targetLat: null,
    targetLng: null,
    targetHeading: null,
    currentDisplayedLat: null,
    currentDisplayedLng: null,
    currentDisplayedHeaging: null
};
*/

//ログ切り替え関数
function toggleLogDisplay() {
    const logDiv = document.getElementById('log');
    if (logDiv) {
        logDiv.style.display = (logDiv.style.display === 'block') ? 'none' : 'block';
    }
}

//Google Maps APIロード
async function loadGoogleMaps() {
    try {
        const res = await fetch("/api/get-api-key");
        if (!res.ok) throw new  Error("APIキーの取得に失敗しました");
        const data = await res.json();
        const API_KEY = data.key;

        if (!API_KEY) {
            logMessage("Google Maps APIキーが設定されてません");
            return;
        }

        window.MAPS_API_KEY = API_KEY;

        ((g) => {
            var h, a, k, p = "The Google Maps Javascript API", c = "google", l = "importLibrary", q = "__ib__", m = document, b = window;
            b = b[c] || (b[c] = {});
            var d = b.maps || (b.maps = {}), r = new Set, e = new URLSearchParams, u = () => h || (h = new Promise(async (f, n) => {
                await (a = m.createElement("script"));
                e.set("libraries", [...r] + "");
                for (k in g) e.set(k.replace(/[A-Z]/g, t => "_" + t[0].toLowerCase()), g[k]);
                e.set("callback", c + ".maps." + q);
                a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
                d[q] = f;
                a.onerror = () => h = n(Error(p + " could not load. "));
                a.nonce = m.querySelector("script[nonce]")?.nonce || "";
                m.head.append(a)
            }));
            d[l] ? console.warn(p + " only loads once. RE-referencing library %s.", r) : d[l] = (f, ...n) => r.add(f) && u().then(() => d[l] (f, ...n))
        })({
            key: API_KEY,
            v: "beta",
            language: "ja",
            mapIds: ["3d7b65239e3531fb68add898"]
        });

        await google.maps.importLibrary("maps");
        await google.maps.importLibrary("routes");
        await google.maps.importLibrary("places");

        if (typeof initMap === "function"){
            initMap();
            logMessage("Google Maps ロード完了");
        }        
    } catch (error) {
        logMessage(`APIキーのロードエラー： ${error.message}`);
        console.error("APIキーロードエラー", error);
    }
}

//イベントリスナーの登録
window.addEventListener("DOMContentLoaded", loadGoogleMaps);

window.addEventListener("load", async () => {
    setTimeout(async () => {
        try {
            logMessage("保存済みのログを確認しています");
            const allSaveData = await getAllPointsFromDB();

            if (allSaveData && allSaveData.length > 0) {
                allPoints = allSaveData.map(d => ({ lat: d.lat, lon: d.lon, time: d.time }));
                logMessage(`合計 ${allPoints.length} 地点の過去ログを読み込みました`);

                calculateFrequentPoints();
                gpxProcessed = true;

                if (typeof drawMap === 'function') drawMap();
            } else {
                logMessage("保存されたログがありません。新しいGPXファイルを読み込んでください");
            }
        } catch (e) {
            console.error("初期読み込みエラー:", e);
        }
    }, 1500);
});

//アプリ全体で共有する単一の状態管理オブジェクト
window.appState = {
    //地図・Google APIインスタンス
    map: null,
    directionsService: null,
    directionsRenderer: null,

    //位置・トラッキング関連
    currentLocationMarker: null,
    destinationMarker: null,
    tempMarker: null,
    watchId: null,
    lastHeading: 0,

    //ナビゲーション状態
    NavigationActive: false,
    currentStepIndex: 0,
    steps: [],
    isRerouting: false,
    isUserInteracting: false,

    routePolyline: [],
    activeTraveledPolyline: null,
    activeRemainingPolylinr: null,
    alternativePolylines: [],
    frequentPolylines: [],
    frequentCircles: [],

    allPoints: [],
    frequentPoints: [],
    gpxProcessed: false,

    resetNavigation() {
        this.NavigationActive = false;
        this.currentStepIndex = 0;
        this. steps = [],
        this.isRerouting = false;
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
    }
};