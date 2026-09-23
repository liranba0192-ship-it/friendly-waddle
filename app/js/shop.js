"use strict";
window.App = window.App || {};

// טאב חנות: מציג את חנות חלבונינץ בתוך האפליקציה. ?src=app מפעיל בחנות 5% הנחת מנוי.
App.shop = (function () {
  const SHOP_URL = "https://halbonintz.com/?src=app";

  function mount(el) {
    el.innerHTML = `
      <div class="shop-bar">
        <span class="shop-perk">🎁 5% הנחה למנויים — אוטומטית בקופה</span>
        <a class="shop-open" href="${SHOP_URL}" target="_blank" rel="noopener">פתח בדפדפן ↗</a>
      </div>
      <iframe class="shop-frame" src="${SHOP_URL}" title="חנות חלבונינץ" allow="clipboard-write"></iframe>`;
  }

  return { mount, show() {}, isHome: () => true };
})();
