module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POSTのみ対応しています"
    });
  }

  const apiKey = process.env.ROADS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "ROADS_API_KEYが設定されてません"
    });
  }

  const points = req.body?.points;

  if (
    !Array.isArray(points) ||
    points.length < 2 ||
    points.length > 50 ||
    !points.every(p =>
      p &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng) &&
      Math.abs(p.lat) <= 90 &&
      Math.abs(p.lng) <= 180
    )
  ) {
    return res.status(400).json({
      error: "2~50地点の座標を指定してください"
    });
  }

  const path = points.map(p => `${p.lat},${p.lng}`).join("|");

  const params = new URLSearchParams({
    path: path,
    interpolate: "true",
    key: apiKey
  });

  try {
    const response = await fetch(
    `https://roads.googleapis.com/v1/snapToRoads?${params}`,
    {
      signal: AbortSignal.timeout(10000)
    }
  );

  const data = await response.json();

  console.log("Roads API HTTP:", response.status);
  console.log("Roads API response:", JSON.stringify(data));
  console.log("Roads API points:", data.snappedPoints?.length ?? 0);

  if (!response.ok || data.error) {
    console.error("RoadsAPI error:", data.error);

    return res.status(502).json({
      error: "RoadsAPIへの接続に失敗しました"
      });
    }

    const snappedPoints = (data.snappedPoints || []).map (p => ({
      lat: p.location.latitude,
      lng: p.location.longitude
      }));

      return res.status(200).json({
        points: snappedPoints
      });
  
  } catch (error) {
    console.error("RoadsAPI error:", error);

    return res.status(502).json({
      error: "道路情報を取得できませんでした"
    });
  }
};

  
