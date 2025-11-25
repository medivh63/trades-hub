'use strict';

const LOCATION_DISMISS_KEY = 'location-banner-dismissed';

/**
 * 使用免费的逆地理编码API获取城市名称
 * 优先使用 Nominatim (OpenStreetMap)，备用 geocode.maps.co
 */
async function getCityFromCoordinates(lat, lng) {
  // 验证是否在加拿大范围内
  const withinCanada = lat >= 41 && lat <= 84 && lng >= -141 && lng <= -52;
  if (!withinCanada) {
    console.warn('坐标不在加拿大范围内');
    return null;
  }

  // 免费API服务列表（按优先级）
  const services = [
    {
      url: `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TradeHub/1.0' // Nominatim 要求 User-Agent
      }
    },
    {
      url: `https://geocode.maps.co/reverse?lat=${lat}&lon=${lng}`,
      headers: {
        'Accept': 'application/json'
      }
    }
  ];

  // 尝试每个服务
  for (const service of services) {
    try {
      const res = await fetch(service.url, { headers: service.headers });
      if (!res.ok) {
        console.warn(`API请求失败: ${res.status}`);
        continue;
      }
      
      const data = await res.json();
      const addr = data?.address || {};
      
      // 提取城市名称
      const cityName = addr.city || addr.town || addr.village || 
                      addr.hamlet || addr.municipality || null;
      
      // 提取省份信息
      const province = addr.state || addr.province || null;
      
      // 省份名称到代码的映射
      const provinceMap = {
        'Ontario': 'ON',
        'Quebec': 'QC',
        'British Columbia': 'BC',
        'Alberta': 'AB',
        'Manitoba': 'MB',
        'Saskatchewan': 'SK',
        'Nova Scotia': 'NS',
        'New Brunswick': 'NB',
        'Newfoundland and Labrador': 'NL',
        'Prince Edward Island': 'PE',
        'Yukon': 'YT',
        'Northwest Territories': 'NT',
        'Nunavut': 'NU'
      };
      
      // 格式化城市名称：城市, 省份代码
      if (cityName && province) {
        const provinceCode = provinceMap[province] || province;
        const formattedCity = `${cityName}, ${provinceCode}`;
        console.log(`逆地理编码成功: ${formattedCity}`);
        return formattedCity;
      }
      
      // 如果只有城市名称
      if (cityName) {
        console.log(`逆地理编码返回城市: ${cityName}`);
        return cityName;
      }
      
      // 如果只有省份
      if (province) {
        console.log(`逆地理编码返回省份: ${province}`);
        return province;
      }
      
    } catch (err) {
      console.warn('逆地理编码API调用失败:', err);
      continue;
    }
  }
  
  return null;
}

/**
 * 根据坐标推断省份（作为最后回退）
 */
function inferProvinceFromCoordinates(lat, lng) {
  if (lat >= 41.7 && lat <= 56.9 && lng >= -95.2 && lng <= -74.3) {
    return 'Ontario';
  } else if (lat >= 45.0 && lat <= 62.0 && lng >= -79.8 && lng <= -57.0) {
    return 'Quebec';
  } else if (lat >= 48.2 && lat <= 60.0 && lng >= -139.1 && lng <= -114.0) {
    return 'British Columbia';
  } else if (lat >= 48.9 && lat <= 60.0 && lng >= -120.0 && lng <= -110.0) {
    return 'Alberta';
  } else if (lat >= 49.0 && lat <= 60.0 && lng >= -110.0 && lng <= -101.0) {
    return 'Saskatchewan';
  } else if (lat >= 49.0 && lat <= 60.0 && lng >= -102.0 && lng <= -95.0) {
    return 'Manitoba';
  } else if (lat >= 45.0 && lat <= 48.1 && lng >= -68.1 && lng <= -63.8) {
    return 'New Brunswick';
  } else if (lat >= 43.4 && lat <= 47.1 && lng >= -66.4 && lng <= -59.4) {
    return 'Nova Scotia';
  }
  return null;
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
    
    setStatus(`已根据${source}选择 ${city}，正在为你搜索。`);
    
    // 将城市名称添加到搜索框（作为搜索关键词）
    searchInput.value = city;
    
    // 如果搜索表单支持城市参数，添加隐藏字段
    let cityInput = searchForm.querySelector('input[name="city"]');
    if (!cityInput) {
      cityInput = document.createElement('input');
      cityInput.type = 'hidden';
      cityInput.name = 'city';
      searchForm.appendChild(cityInput);
    }
    cityInput.value = city;
    
    // 同时更新首页列表（如果存在）
    const resultsDiv = document.getElementById('results');
    if (resultsDiv && typeof htmx !== 'undefined') {
      // 使用 HTMX 加载该城市的列表
      htmx.ajax('GET', `/?city=${encodeURIComponent(city)}`, {
        target: '#results',
        swap: 'innerHTML'
      });
    }
    
    // 提交搜索表单
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
        
        // 验证是否在加拿大范围内
        const withinCanada = latitude >= 41 && latitude <= 84 && 
                             longitude >= -141 && longitude <= -52;
        if (!withinCanada) {
          setStatus('当前位置不在加拿大境内。请确保您在加拿大，或使用加拿大邮编。', true);
          return;
        }
        
        console.log(`开始获取城市，坐标: (${latitude}, ${longitude})`);
        
        // 1. 优先使用免费API获取城市名称
        let cityName = await getCityFromCoordinates(latitude, longitude);
        let source = '逆地理编码';
        
        // 2. 如果API失败，根据坐标推断省份
        if (!cityName) {
          cityName = inferProvinceFromCoordinates(latitude, longitude);
          source = '坐标推断';
          if (cityName) {
            console.log(`根据坐标推断省份: ${cityName}`);
          }
        }
        
        // 3. 最后回退
        if (!cityName) {
          cityName = 'Canada';
          source = '区域回退';
          console.log('使用最后回退: Canada');
        }
        
        // 应用结果
        console.log(`最终城市: ${cityName} (来源: ${source})`);
        applyCity(cityName, source);
      },
      (err) => {
        setStatus(`无法获取位置：${err.message}`, true);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  });

  // 加拿大邮编到城市映射（加拿大邮编格式：A1A 1A1，前3位字母数字组合表示区域）
  const POSTAL_TO_CITY = {
    // Toronto, ON (M开头)
    'M5H': 'Toronto, ON',
    'M5J': 'Toronto, ON',
    'M5K': 'Toronto, ON',
    'M5L': 'Toronto, ON',
    'M5M': 'Toronto, ON',
    'M5N': 'Toronto, ON',
    'M5P': 'Toronto, ON',
    'M5R': 'Toronto, ON',
    'M5S': 'Toronto, ON',
    'M5T': 'Toronto, ON',
    'M5V': 'Toronto, ON',
    'M5W': 'Toronto, ON',
    'M5X': 'Toronto, ON',
    'M6A': 'Toronto, ON',
    'M6B': 'Toronto, ON',
    'M6C': 'Toronto, ON',
    'M6E': 'Toronto, ON',
    'M6G': 'Toronto, ON',
    'M6H': 'Toronto, ON',
    'M6J': 'Toronto, ON',
    'M6K': 'Toronto, ON',
    'M6M': 'Toronto, ON',
    'M6N': 'Toronto, ON',
    'M6P': 'Toronto, ON',
    'M6R': 'Toronto, ON',
    'M6S': 'Toronto, ON',
    'M6T': 'Toronto, ON',
    // Montreal, QC (H开头)
    'H1A': 'Montreal, QC',
    'H1B': 'Montreal, QC',
    'H1C': 'Montreal, QC',
    'H1E': 'Montreal, QC',
    'H1G': 'Montreal, QC',
    'H1H': 'Montreal, QC',
    'H1J': 'Montreal, QC',
    'H1K': 'Montreal, QC',
    'H1L': 'Montreal, QC',
    'H1M': 'Montreal, QC',
    'H1N': 'Montreal, QC',
    'H1P': 'Montreal, QC',
    'H1R': 'Montreal, QC',
    'H1S': 'Montreal, QC',
    'H1T': 'Montreal, QC',
    'H1V': 'Montreal, QC',
    'H1W': 'Montreal, QC',
    'H1X': 'Montreal, QC',
    'H1Y': 'Montreal, QC',
    'H1Z': 'Montreal, QC',
    'H2A': 'Montreal, QC',
    'H2B': 'Montreal, QC',
    'H2C': 'Montreal, QC',
    'H2E': 'Montreal, QC',
    'H2G': 'Montreal, QC',
    'H2H': 'Montreal, QC',
    'H2J': 'Montreal, QC',
    'H2K': 'Montreal, QC',
    'H2L': 'Montreal, QC',
    'H2M': 'Montreal, QC',
    'H2N': 'Montreal, QC',
    'H2P': 'Montreal, QC',
    'H2R': 'Montreal, QC',
    'H2S': 'Montreal, QC',
    'H2T': 'Montreal, QC',
    'H2V': 'Montreal, QC',
    'H2W': 'Montreal, QC',
    'H2X': 'Montreal, QC',
    'H2Y': 'Montreal, QC',
    'H2Z': 'Montreal, QC',
    'H3A': 'Montreal, QC',
    'H3B': 'Montreal, QC',
    'H3C': 'Montreal, QC',
    'H3E': 'Montreal, QC',
    'H3G': 'Montreal, QC',
    'H3H': 'Montreal, QC',
    'H3J': 'Montreal, QC',
    'H3K': 'Montreal, QC',
    'H3L': 'Montreal, QC',
    'H3M': 'Montreal, QC',
    'H3N': 'Montreal, QC',
    'H3P': 'Montreal, QC',
    'H3R': 'Montreal, QC',
    'H3S': 'Montreal, QC',
    'H3T': 'Montreal, QC',
    'H3V': 'Montreal, QC',
    'H3W': 'Montreal, QC',
    'H3X': 'Montreal, QC',
    'H3Y': 'Montreal, QC',
    'H3Z': 'Montreal, QC',
    // Vancouver, BC (V开头)
    'V5A': 'Vancouver, BC',
    'V5B': 'Vancouver, BC',
    'V5C': 'Vancouver, BC',
    'V5E': 'Vancouver, BC',
    'V5G': 'Vancouver, BC',
    'V5H': 'Vancouver, BC',
    'V5J': 'Vancouver, BC',
    'V5K': 'Vancouver, BC',
    'V5L': 'Vancouver, BC',
    'V5M': 'Vancouver, BC',
    'V5N': 'Vancouver, BC',
    'V5P': 'Vancouver, BC',
    'V5R': 'Vancouver, BC',
    'V5S': 'Vancouver, BC',
    'V5T': 'Vancouver, BC',
    'V5V': 'Vancouver, BC',
    'V5W': 'Vancouver, BC',
    'V5X': 'Vancouver, BC',
    'V5Y': 'Vancouver, BC',
    'V5Z': 'Vancouver, BC',
    'V6A': 'Vancouver, BC',
    'V6B': 'Vancouver, BC',
    'V6C': 'Vancouver, BC',
    'V6E': 'Vancouver, BC',
    'V6G': 'Vancouver, BC',
    'V6H': 'Vancouver, BC',
    'V6J': 'Vancouver, BC',
    'V6K': 'Vancouver, BC',
    'V6L': 'Vancouver, BC',
    'V6M': 'Vancouver, BC',
    'V6N': 'Vancouver, BC',
    'V6P': 'Vancouver, BC',
    'V6R': 'Vancouver, BC',
    'V6S': 'Vancouver, BC',
    'V6T': 'Vancouver, BC',
    'V6V': 'Vancouver, BC',
    'V6W': 'Vancouver, BC',
    'V6X': 'Vancouver, BC',
    'V6Y': 'Vancouver, BC',
    'V6Z': 'Vancouver, BC',
    // Calgary, AB (T开头)
    'T1P': 'Calgary, AB',
    'T1R': 'Calgary, AB',
    'T1S': 'Calgary, AB',
    'T1T': 'Calgary, AB',
    'T1V': 'Calgary, AB',
    'T1W': 'Calgary, AB',
    'T1X': 'Calgary, AB',
    'T1Y': 'Calgary, AB',
    'T1Z': 'Calgary, AB',
    'T2A': 'Calgary, AB',
    'T2B': 'Calgary, AB',
    'T2C': 'Calgary, AB',
    'T2E': 'Calgary, AB',
    'T2G': 'Calgary, AB',
    'T2H': 'Calgary, AB',
    'T2J': 'Calgary, AB',
    'T2K': 'Calgary, AB',
    'T2L': 'Calgary, AB',
    'T2M': 'Calgary, AB',
    'T2N': 'Calgary, AB',
    'T2P': 'Calgary, AB',
    'T2R': 'Calgary, AB',
    'T2S': 'Calgary, AB',
    'T2T': 'Calgary, AB',
    'T2V': 'Calgary, AB',
    'T2W': 'Calgary, AB',
    'T2X': 'Calgary, AB',
    'T2Y': 'Calgary, AB',
    'T2Z': 'Calgary, AB',
    // Edmonton, AB (T开头)
    'T5A': 'Edmonton, AB',
    'T5B': 'Edmonton, AB',
    'T5C': 'Edmonton, AB',
    'T5E': 'Edmonton, AB',
    'T5G': 'Edmonton, AB',
    'T5H': 'Edmonton, AB',
    'T5J': 'Edmonton, AB',
    'T5K': 'Edmonton, AB',
    'T5L': 'Edmonton, AB',
    'T5M': 'Edmonton, AB',
    'T5N': 'Edmonton, AB',
    'T5P': 'Edmonton, AB',
    'T5R': 'Edmonton, AB',
    'T5S': 'Edmonton, AB',
    'T5T': 'Edmonton, AB',
    'T5V': 'Edmonton, AB',
    'T5W': 'Edmonton, AB',
    'T5X': 'Edmonton, AB',
    'T5Y': 'Edmonton, AB',
    'T5Z': 'Edmonton, AB',
    'T6A': 'Edmonton, AB',
    'T6B': 'Edmonton, AB',
    'T6C': 'Edmonton, AB',
    'T6E': 'Edmonton, AB',
    'T6G': 'Edmonton, AB',
    'T6H': 'Edmonton, AB',
    'T6J': 'Edmonton, AB',
    'T6K': 'Edmonton, AB',
    'T6L': 'Edmonton, AB',
    'T6M': 'Edmonton, AB',
    'T6N': 'Edmonton, AB',
    'T6P': 'Edmonton, AB',
    'T6R': 'Edmonton, AB',
    'T6S': 'Edmonton, AB',
    'T6T': 'Edmonton, AB',
    'T6V': 'Edmonton, AB',
    'T6W': 'Edmonton, AB',
    'T6X': 'Edmonton, AB',
    // Ottawa, ON (K开头)
    'K1A': 'Ottawa, ON',
    'K1B': 'Ottawa, ON',
    'K1C': 'Ottawa, ON',
    'K1E': 'Ottawa, ON',
    'K1G': 'Ottawa, ON',
    'K1H': 'Ottawa, ON',
    'K1J': 'Ottawa, ON',
    'K1K': 'Ottawa, ON',
    'K1L': 'Ottawa, ON',
    'K1M': 'Ottawa, ON',
    'K1N': 'Ottawa, ON',
    'K1P': 'Ottawa, ON',
    'K1R': 'Ottawa, ON',
    'K1S': 'Ottawa, ON',
    'K1T': 'Ottawa, ON',
    'K1V': 'Ottawa, ON',
    'K1W': 'Ottawa, ON',
    'K1X': 'Ottawa, ON',
    'K1Y': 'Ottawa, ON',
    'K1Z': 'Ottawa, ON',
    'K2A': 'Ottawa, ON',
    'K2B': 'Ottawa, ON',
    'K2C': 'Ottawa, ON',
    'K2E': 'Ottawa, ON',
    'K2G': 'Ottawa, ON',
    'K2H': 'Ottawa, ON',
    'K2J': 'Ottawa, ON',
    'K2K': 'Ottawa, ON',
    'K2L': 'Ottawa, ON',
    'K2M': 'Ottawa, ON',
    'K2P': 'Ottawa, ON',
    'K2R': 'Ottawa, ON',
    'K2S': 'Ottawa, ON',
    'K2T': 'Ottawa, ON',
    'K2V': 'Ottawa, ON',
    'K2W': 'Ottawa, ON',
    // Winnipeg, MB (R开头)
    'R2C': 'Winnipeg, MB',
    'R2E': 'Winnipeg, MB',
    'R2G': 'Winnipeg, MB',
    'R2H': 'Winnipeg, MB',
    'R2J': 'Winnipeg, MB',
    'R2K': 'Winnipeg, MB',
    'R2L': 'Winnipeg, MB',
    'R2M': 'Winnipeg, MB',
    'R2N': 'Winnipeg, MB',
    'R2P': 'Winnipeg, MB',
    'R2R': 'Winnipeg, MB',
    'R2V': 'Winnipeg, MB',
    'R2W': 'Winnipeg, MB',
    'R2X': 'Winnipeg, MB',
    'R2Y': 'Winnipeg, MB',
    'R3A': 'Winnipeg, MB',
    'R3B': 'Winnipeg, MB',
    'R3C': 'Winnipeg, MB',
    'R3E': 'Winnipeg, MB',
    'R3G': 'Winnipeg, MB',
    'R3H': 'Winnipeg, MB',
    'R3J': 'Winnipeg, MB',
    'R3K': 'Winnipeg, MB',
    'R3L': 'Winnipeg, MB',
    'R3M': 'Winnipeg, MB',
    'R3N': 'Winnipeg, MB',
    'R3P': 'Winnipeg, MB',
    'R3R': 'Winnipeg, MB',
    'R3S': 'Winnipeg, MB',
    'R3T': 'Winnipeg, MB',
    'R3V': 'Winnipeg, MB',
    'R3W': 'Winnipeg, MB',
    'R3X': 'Winnipeg, MB',
    'R3Y': 'Winnipeg, MB',
    // Halifax, NS (B开头)
    'B2H': 'Halifax, NS',
    'B2N': 'Halifax, NS',
    'B2R': 'Halifax, NS',
    'B2S': 'Halifax, NS',
    'B2T': 'Halifax, NS',
    'B2W': 'Halifax, NS',
    'B2X': 'Halifax, NS',
    'B2Y': 'Halifax, NS',
    'B2Z': 'Halifax, NS',
    'B3A': 'Halifax, NS',
    'B3B': 'Halifax, NS',
    'B3C': 'Halifax, NS',
    'B3E': 'Halifax, NS',
    'B3G': 'Halifax, NS',
    'B3H': 'Halifax, NS',
    'B3J': 'Halifax, NS',
    'B3K': 'Halifax, NS',
    'B3L': 'Halifax, NS',
    'B3M': 'Halifax, NS',
    'B3N': 'Halifax, NS',
    'B3P': 'Halifax, NS',
    'B3R': 'Halifax, NS',
    'B3S': 'Halifax, NS',
    'B3T': 'Halifax, NS',
    'B3V': 'Halifax, NS',
    'B3W': 'Halifax, NS',
    'B3Z': 'Halifax, NS',
  };

  postalForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const postalInput = postalForm.querySelector('input[name="postal"]');
    if (!postalInput) return;
    const postal = postalInput.value.trim().toUpperCase().replace(/\s+/g, '');
    if (!postal) {
      setStatus('请输入邮政编码。', true);
      return;
    }
    // 加拿大邮编格式：A1A 1A1，提取前3位（字母数字组合）
    const postalPrefix = postal.substring(0, 3);
    const city = POSTAL_TO_CITY[postalPrefix];
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
