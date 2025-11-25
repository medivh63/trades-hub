'use strict';

const LOCATION_DISMISS_KEY = 'location-banner-dismissed';

const CITY_ZONES = [
  // North America (rough bounding boxes)
  { name: 'New York, NY', lat: [40.4, 41.2], lng: [-74.5, -73.5] },
  { name: 'Boston, MA', lat: [42.1, 42.6], lng: [-71.3, -70.9] },
  { name: 'Chicago, IL', lat: [41.6, 42.2], lng: [-88.2, -87.3] },
  { name: 'San Francisco, CA', lat: [37.5, 37.9], lng: [-122.6, -122.2] },
  { name: 'Los Angeles, CA', lat: [33.7, 34.3], lng: [-118.7, -118.1] },
  { name: 'Seattle, WA', lat: [47.4, 47.8], lng: [-122.5, -122.1] },
  { name: 'Austin, TX', lat: [30.0, 30.6], lng: [-98.1, -97.3] },
  { name: 'Vancouver, BC', lat: [49.1, 49.4], lng: [-123.3, -122.9] },
  { name: 'Toronto, ON', lat: [43.5, 43.9], lng: [-79.7, -79.0] },
  { name: 'Montreal, QC', lat: [45.4, 45.7], lng: [-73.8, -73.4] },
  // Canada provinces (broad boxes to cover remaining areas)
  { name: 'British Columbia', lat: [48.2, 60.0], lng: [-139.1, -114.0] },
  { name: 'Alberta', lat: [48.9, 60.0], lng: [-120.0, -110.0] },
  { name: 'Saskatchewan', lat: [49.0, 60.0], lng: [-110.0, -101.0] },
  { name: 'Manitoba', lat: [49.0, 60.0], lng: [-102.0, -95.0] },
  { name: 'Ontario', lat: [41.7, 56.9], lng: [-95.2, -74.3] },
  { name: 'Quebec', lat: [45.0, 62.0], lng: [-79.8, -57.0] },
  { name: 'New Brunswick', lat: [45.0, 48.1], lng: [-68.1, -63.8] },
  { name: 'Nova Scotia', lat: [43.4, 47.1], lng: [-66.4, -59.4] },
  { name: 'Prince Edward Island', lat: [45.9, 47.1], lng: [-64.5, -61.8] },
  { name: 'Newfoundland and Labrador', lat: [46.5, 60.4], lng: [-67.0, -52.0] },
  { name: 'Yukon', lat: [59.9, 69.7], lng: [-141.0, -123.8] },
  { name: 'Northwest Territories', lat: [59.8, 78.8], lng: [-136.6, -102.0] },
  { name: 'Nunavut', lat: [60.0, 83.2], lng: [-110.0, -60.0] },
  // Country-level fallbacks
  { name: 'Canada', lat: [41.0, 84.0], lng: [-141.0, -52.0] },
  { name: 'United States', lat: [24.0, 49.5], lng: [-125.0, -66.5] }
];

function guessCityFromCoords(lat, lng) {
  return CITY_ZONES.find(
    (zone) =>
      lat >= zone.lat[0] &&
      lat <= zone.lat[1] &&
      lng >= zone.lng[0] &&
      lng <= zone.lng[1]
  )?.name;
}

async function reverseGeocodeCity(lat, lng) {
  // Uses a free Nominatim-based endpoint; for production, swap to a provider with SLA/key.
  const url = `https://geocode.maps.co/reverse?lat=${lat}&lon=${lng}`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data?.address || {};
    // Prefer city-level names; fall back to province/state.
    return (
      addr.city ||
      addr.town ||
      addr.village ||
      addr.hamlet ||
      addr.municipality ||
      addr.state ||
      null
    );
  } catch (_) {
    return null;
  }
}

async function resolveCity(lat, lng) {
  const local = guessCityFromCoords(lat, lng);
  if (local) return { city: local, source: '定位' };

  const remote = await reverseGeocodeCity(lat, lng);
  if (remote) return { city: remote, source: '逆地理' };

  // Broad country-level fallbacks
  const withinCanada =
    lat >= 41 && lat <= 84 &&
    lng >= -141 && lng <= -52;
  const withinUS =
    lat >= 24 && lat <= 49.5 &&
    lng >= -125 && lng <= -66.5;
  if (withinCanada) return { city: 'Canada', source: '定位(区域)' };
  if (withinUS) return { city: 'United States', source: '定位(区域)' };

  // Final fallback: return coordinates string so it never fails silently.
  return { city: `${lat.toFixed(3)}, ${lng.toFixed(3)}`, source: '定位(坐标)' };
}

document.addEventListener('DOMContentLoaded', () => {
  const useLocationBtn = document.querySelector('[data-use-location]');
  const postalForm = document.querySelector('[data-postal-form]');
  const statusEl = document.querySelector('[data-location-status]');
  const closeBtn = document.querySelector('[data-location-close]');
  const locationBanner = document.getElementById('location-banner');
  const searchInput = document.getElementById('global-search-input');
  const searchForm = document.querySelector('.nav-search');

  const setStatus = (text, isError = false) => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle('is-error', Boolean(isError));
  };

  const applyCity = (city, source) => {
    if (!searchInput || !searchForm) {
      setStatus('无法定位搜索输入框，请刷新页面。', true);
      return;
    }
    searchInput.value = city;
    setStatus(`已根据${source}选择 ${city}，正在为你搜索。`);
    searchForm.requestSubmit();
  };

  useLocationBtn?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      setStatus('当前浏览器不支持地理定位，请输入邮编。', true);
      return;
    }
    setStatus('正在请求定位授权...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setStatus(`已获取经纬度 (${latitude.toFixed(4)}, ${longitude.toFixed(4)})，正在匹配城市...`);
        const match = await resolveCity(latitude, longitude);
        const cityName = match?.city;
        if (cityName) {
          applyCity(cityName, match.source);
        } else {
          setStatus('已获取经纬度，但暂无法匹配到城市，请输入邮编。', true);
        }
      },
      (err) => {
        setStatus(`无法获取位置：${err.message}`, true);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  });

  postalForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const postalInput = postalForm.querySelector('input[name="postal"]');
    if (!postalInput) return;
    const postal = postalInput.value.trim();
    if (!postal) {
      setStatus('请输入邮政编码。', true);
      return;
    }
    const city = POSTAL_TO_CITY[postal];
    if (!city) {
      setStatus('暂不支持该邮编，请重试或开启定位权限。', true);
      return;
    }
    applyCity(city, '邮编');
  });

  const hideLocationBanner = () => {
    const banner = document.getElementById('location-banner');
    if (!banner) return;
    try {
      localStorage.setItem(LOCATION_DISMISS_KEY, '1');
    } catch (_) {}
    banner.setAttribute('aria-hidden', 'true');
    banner.remove();
  };

  closeBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    hideLocationBanner();
  });

  // Fallback in case the button is re-rendered dynamically.
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-location-close]');
    if (!target) return;
    event.preventDefault();
    hideLocationBanner();
  });

  try {
    const dismissed = localStorage.getItem(LOCATION_DISMISS_KEY) === '1';
    if (dismissed) {
      hideLocationBanner();
    }
  } catch (_) {}
});
