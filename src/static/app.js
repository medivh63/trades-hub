'use strict';

const CITY_ZONES = [
  { name: '上海', lat: [30.9, 31.6], lng: [120.8, 122.2] },
  { name: '北京', lat: [39.4, 40.4], lng: [115.7, 117.5] },
  { name: '广州', lat: [22.4, 23.5], lng: [112.9, 114.1] },
  { name: '深圳', lat: [22.4, 22.9], lng: [113.7, 114.3] },
  { name: '杭州', lat: [29.9, 30.6], lng: [119.5, 120.6] }
];

const POSTAL_TO_CITY = {
  '200000': '上海',
  '100000': '北京',
  '510000': '广州',
  '518000': '深圳',
  '310000': '杭州'
};

function guessCityFromCoords(lat, lng) {
  return CITY_ZONES.find(
    (zone) =>
      lat >= zone.lat[0] &&
      lat <= zone.lat[1] &&
      lng >= zone.lng[0] &&
      lng <= zone.lng[1]
  )?.name;
}

document.addEventListener('DOMContentLoaded', () => {
  const useLocationBtn = document.querySelector('[data-use-location]');
  const postalForm = document.querySelector('[data-postal-form]');
  const statusEl = document.querySelector('[data-location-status]');
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
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const city = guessCityFromCoords(latitude, longitude);
        if (city) {
          applyCity(city, '定位');
        } else {
          setStatus('已获取经纬度，但暂无法匹配到支持的城市，请输入邮编。', true);
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
});
