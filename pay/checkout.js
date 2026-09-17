(function () {
  var cfg = window.KHARCHLOG_PAY || {};
  var firstNameInput = document.getElementById('firstName');
  var lastNameInput = document.getElementById('lastName');
  var emailInput = document.getElementById('email');
  var phoneInput = document.getElementById('phone');
  var payBtn = document.getElementById('payBtn');
  var paypalWrap = document.getElementById('paypal-buttons');
  var statusEl = document.getElementById('status');
  var priceEl = document.getElementById('pay-price');
  var fineEl = document.getElementById('pay-fine');
  var params = new URLSearchParams(window.location.search);
  var USD_ENABLED = !!(cfg.paypalClientId || cfg.usdEnabled);
  var requested = (params.get('currency') || cfg.currency || 'INR').toUpperCase();
  var currency = USD_ENABLED && requested === 'USD' ? 'USD' : 'INR';
  var paypalSdkReady = null;
  var paypalRendered = false;

  function priceLabel() {
    return currency === 'USD' ? '$2' : '₹149';
  }

  function syncCurrencyUi() {
    if (priceEl) {
      priceEl.innerHTML = priceLabel() + ' <span class="pay-once">one-time</span>';
    }
    if (payBtn) {
      payBtn.textContent = currency === 'USD' ? 'Pay $2 with PayPal' : 'Pay ₹149';
      payBtn.hidden = currency === 'USD';
      payBtn.classList.toggle('is-hidden', currency === 'USD');
      payBtn.setAttribute('aria-hidden', currency === 'USD' ? 'true' : 'false');
    }
    if (paypalWrap) {
      paypalWrap.hidden = currency !== 'USD';
      paypalWrap.classList.toggle('is-hidden', currency !== 'USD');
    }
    if (fineEl) {
      fineEl.innerHTML =
        currency === 'USD'
          ? 'Secure checkout via PayPal (USD). Questions? <a href="mailto:easypeezetools@gmail.com">easypeezetools@gmail.com</a>'
          : 'Secure checkout via Razorpay. Questions? <a href="mailto:easypeezetools@gmail.com">easypeezetools@gmail.com</a>';
    }
    document.querySelectorAll('.pay-currency__btn').forEach(function (btn) {
      var isUsd = btn.getAttribute('data-currency') === 'USD';
      btn.classList.toggle('is-active', (isUsd && currency === 'USD') || (!isUsd && currency === 'INR'));
      if (isUsd && !USD_ENABLED) {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
        btn.classList.add('pay-currency__btn--soon');
        if (btn.querySelector('.pay-currency__soon') === null) {
          btn.innerHTML =
            'Pay in $ USD <span class="pay-currency__soon">Coming soon</span>';
        }
      } else if (isUsd && USD_ENABLED) {
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
        btn.classList.remove('pay-currency__btn--soon');
        btn.textContent = 'Pay in $ USD';
      }
    });
    if (currency === 'USD' && USD_ENABLED) {
      ensurePaypalButtons();
    }
  }

  syncCurrencyUi();
  document.querySelectorAll('.pay-currency__btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
      currency = btn.getAttribute('data-currency') === 'USD' ? 'USD' : 'INR';
      syncCurrencyUi();
    });
  });

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.className = 'pay-status' + (isError ? ' pay-status-error' : '');
  }

  var NAME_BLOCKLIST = {
    test: 1, asdf: 1, asdfgh: 1, qwerty: 1, qwertyuiop: 1, abc: 1, abcd: 1, abcde: 1,
    xyz: 1, xxx: 1, aaa: 1, bbb: 1, ccc: 1, name: 1, fname: 1, lname: 1, firstname: 1,
    lastname: 1, user: 1, username: 1, admin: 1, null: 1, undefined: 1, none: 1, na: 1,
    foo: 1, bar: 1, baz: 1, spam: 1, fake: 1, guest: 1, demo: 1, sample: 1, zxcvbn: 1,
    hjkl: 1, anon: 1, anonymous: 1, me: 1, you: 1, hi: 1, hey: 1, ok: 1, idk: 1
  };

  function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function isRealPersonName(value) {
    var name = normalizeName(value);
    if (name.length < 2 || name.length > 40) return false;
    if (
      !/^[A-Za-z\u00C0-\u024F\u0900-\u097F](?:[A-Za-z\u00C0-\u024F\u0900-\u097F\s'.-]{0,38}[A-Za-z\u00C0-\u024F\u0900-\u097F])?$/.test(
        name
      )
    ) {
      return false;
    }
    var compact = name.replace(/[\s'.-]/g, '');
    if (compact.length < 2) return false;
    if (/^(.)\1+$/i.test(compact)) return false;
    if (/(.)\1{2,}/i.test(compact)) return false;
    var key = compact.toLowerCase();
    if (NAME_BLOCKLIST[key]) return false;
    if (/^[A-Za-z]+$/.test(compact) && !/[aeiouy]/i.test(compact)) return false;
    return true;
  }

  function normalizePhone(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    var digits = s.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
      digits = '91' + digits;
    } else if (digits.length === 11 && digits.charAt(0) === '0' && /^[6-9]\d{9}$/.test(digits.slice(1))) {
      digits = '91' + digits.slice(1);
    }
    if (digits.length < 11 || digits.length > 15) return null;
    if (/^(\d)\1+$/.test(digits)) return null;
    if (digits.indexOf('91') === 0 && digits.length === 12 && !/^91[6-9]\d{9}$/.test(digits)) {
      return null;
    }
    if (
      /^91(0{10}|1{10}|2{10}|3{10}|4{10}|5{10}|6{10}|7{10}|8{10}|9{10}|1234567890|0123456789|9876543210)$/.test(
        digits
      )
    ) {
      return null;
    }
    return '+' + digits;
  }

  function readEmailFromQuery() {
    var e = (params.get('email') || '').trim();
    if (e && emailInput) emailInput.value = e;
  }

  function validateConfig() {
    if (!cfg.trackerUrl) {
      setStatus('Missing trackerUrl in pay/config.js', true);
      if (payBtn) payBtn.disabled = true;
      return false;
    }
    if (!USD_ENABLED && !cfg.razorpayKeyId) {
      setStatus('Payment is not configured yet. Try again shortly.', true);
      if (payBtn) payBtn.disabled = true;
      return false;
    }
    return true;
  }

  function apiBase() {
    return (cfg.trackerUrl || '').replace(/\/$/, '');
  }

  function createOrder(payload) {
    return fetch(apiBase() + '/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json();
    });
  }

  function capturePaypal(payload) {
    return fetch(apiBase() + '/paypal/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json();
    });
  }

  function readBuyer() {
    var firstName = normalizeName((firstNameInput && firstNameInput.value) || '');
    var lastName = normalizeName((lastNameInput && lastNameInput.value) || '');
    var email = (emailInput.value || '').trim().toLowerCase();
    var phone = normalizePhone((phoneInput && phoneInput.value) || '');
    if (!isRealPersonName(firstName)) {
      setStatus('Enter a real first name (letters only, not junk like “test” / “asdf”)', true);
      if (firstNameInput) firstNameInput.focus();
      return null;
    }
    if (lastName && !isRealPersonName(lastName)) {
      setStatus('Enter a real last name, or leave it blank', true);
      if (lastNameInput) lastNameInput.focus();
      return null;
    }
    if (!email || email.indexOf('@') < 1 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('Enter the Google email you will use to sign in to the app', true);
      emailInput.focus();
      return null;
    }
    if (!phone) {
      setStatus('Enter a valid phone with country code (e.g. +91 98765 43210)', true);
      if (phoneInput) phoneInput.focus();
      return null;
    }
    return {
      firstName: firstName,
      lastName: lastName,
      email: email,
      phone: phone,
      displayName: [firstName, lastName].filter(Boolean).join(' ')
    };
  }

  function loadPaypalSdk() {
    if (window.paypal) return Promise.resolve();
    if (paypalSdkReady) return paypalSdkReady;
    var clientId = cfg.paypalClientId;
    if (!clientId) {
      return Promise.reject(new Error('PayPal is not configured'));
    }
    var sandbox = String(cfg.paypalMode || 'sandbox').toLowerCase() !== 'live';
    var qs =
      'client-id=' +
      encodeURIComponent(clientId) +
      '&currency=USD&intent=capture&components=buttons' +
      (sandbox ? '&disable-funding=card,credit,paylater,venmo' : '');
    paypalSdkReady = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://www.paypal.com/sdk/js?' + qs;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('PayPal SDK failed to load'));
      };
      document.head.appendChild(s);
    });
    return paypalSdkReady;
  }

  function ensurePaypalButtons() {
    if (!paypalWrap || paypalRendered || !USD_ENABLED) return;
    loadPaypalSdk()
      .then(function () {
        if (paypalRendered || !window.paypal) return;
        paypalRendered = true;
        window.paypal
          .Buttons({
            style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
            createOrder: function () {
              var buyer = readBuyer();
              if (!buyer) return Promise.reject(new Error('Fix the form fields first'));
              setStatus('Creating PayPal order…');
              try {
                sessionStorage.setItem('kharchlog_pay_email', buyer.email);
                sessionStorage.setItem('kharchlog_pay_firstName', buyer.firstName);
                sessionStorage.setItem('kharchlog_pay_lastName', buyer.lastName);
                sessionStorage.setItem('kharchlog_pay_phone', buyer.phone);
              } catch (e) {}
              return createOrder({
                email: buyer.email,
                phone: buyer.phone,
                firstName: buyer.firstName,
                lastName: buyer.lastName,
                name: buyer.displayName,
                product: 'kharchlog',
                planType: 'lifetime',
      staging: !!(cfg.staging),
                currency: 'USD',
                staging: !!cfg.staging
              }).then(function (orderData) {
                if (!orderData || !orderData.ok || orderData.provider !== 'paypal' || !orderData.orderId) {
                  throw new Error((orderData && orderData.error) || 'Could not start PayPal checkout');
                }
                setStatus('Continue in PayPal…');
                return orderData.orderId;
              });
            },
            onApprove: function (data) {
              var buyer = readBuyer() || {
                email: (emailInput.value || '').trim().toLowerCase(),
                firstName: normalizeName((firstNameInput && firstNameInput.value) || ''),
                lastName: normalizeName((lastNameInput && lastNameInput.value) || ''),
                phone: normalizePhone((phoneInput && phoneInput.value) || '') || ''
              };
              setStatus('Confirming PayPal payment…');
              return capturePaypal({
                orderId: data.orderID,
                email: buyer.email,
                phone: buyer.phone,
                firstName: buyer.firstName,
                lastName: buyer.lastName,
                product: 'kharchlog',
                planType: 'lifetime',
      staging: !!(cfg.staging),
                staging: !!cfg.staging
              }).then(function (result) {
                if (!result || !result.ok) {
                  throw new Error((result && result.error) || 'PayPal capture failed');
                }
                var q = new URLSearchParams();
                q.set('email', result.email || buyer.email);
                q.set('firstName', buyer.firstName || '');
                q.set('lastName', buyer.lastName || '');
                q.set('phone', buyer.phone || '');
                q.set('provider', 'paypal');
                if (result.paymentId) q.set('payment_id', result.paymentId);
                if (result.orderId) q.set('order_id', result.orderId);
                q.set('paid', result.paid ? '1' : '0');
                if (result.staging) q.set('staging', '1');
                if (result.message) q.set('msg', result.message);
                window.location.href = (cfg.staging ? 'success.html?' : '/pay/success.html?') + q.toString();
              });
            },
            onCancel: function () {
              setStatus('PayPal checkout cancelled');
            },
            onError: function (err) {
              console.error('PayPal onError', err);
              var sandbox = String(cfg.paypalMode || 'sandbox').toLowerCase() !== 'live';
              setStatus(
                sandbox
                  ? 'PayPal failed — click the yellow button, then Log In with a Sandbox Personal buyer (developer.paypal.com → Sandbox → Accounts). Guest cards often fail.'
                  : 'PayPal checkout failed — try again',
                true
              );
            }
          })
          .render('#paypal-buttons');
      })
      .catch(function (e) {
        setStatus((e && e.message) || 'PayPal failed to load', true);
      });
  }

  function openRazorpayModal(buyer, orderData) {
    var keyId = (orderData && orderData.razorpayKeyId) || cfg.razorpayKeyId;
    var amount = (orderData && orderData.amount) || cfg.amountPaise;
    var orderCurrency = (orderData && orderData.currency) || 'INR';
    var orderId = orderData && orderData.orderId;
    var fullName = [buyer.firstName, buyer.lastName].filter(Boolean).join(' ');

    if (!keyId || !amount) {
      return Promise.reject(new Error('Payment is not configured yet'));
    }
    if (typeof Razorpay !== 'function') {
      return Promise.reject(new Error('Razorpay SDK failed to load — refresh and try again'));
    }

    setStatus('Opening checkout…');

    return new Promise(function (resolve, reject) {
      var options = {
        key: keyId,
        amount: amount,
        currency: orderCurrency,
        name: cfg.productName || 'Kharch Log',
        description: cfg.productDescription || 'One-time lifetime access',
        prefill: {
          name: fullName,
          email: buyer.email,
          contact: buyer.phone || ''
        },
        notes: {
          email: buyer.email,
          firstName: buyer.firstName,
          lastName: buyer.lastName,
          name: fullName,
          product: 'kharchlog',
          planType: 'lifetime',
      staging: !!(cfg.staging)
        },
        theme: { color: '#0F2A43' },
        handler: function (response) {
          var q = new URLSearchParams();
          q.set('email', buyer.email);
          q.set('firstName', buyer.firstName);
          q.set('lastName', buyer.lastName);
          q.set('phone', buyer.phone || '');
          if (response.razorpay_payment_id) q.set('payment_id', response.razorpay_payment_id);
          if (response.razorpay_order_id) q.set('order_id', response.razorpay_order_id);
          if (response.razorpay_signature) q.set('signature', response.razorpay_signature);
          window.location.href = '/pay/success.html?' + q.toString();
          resolve({ ok: true });
        },
        modal: {
          ondismiss: function () {
            reject(new Error('Checkout closed'));
          }
        }
      };

      if (orderId) options.order_id = orderId;

      var rzp = new Razorpay(options);
      rzp.on('payment.failed', function (resp) {
        var msg =
          (resp.error && resp.error.description) ||
          (resp.error && resp.error.reason) ||
          'Payment failed';
        reject(new Error(msg));
      });
      rzp.open();
    });
  }

  function openCheckout() {
    if (currency === 'USD') {
      setStatus('Use the PayPal buttons below to pay in USD');
      ensurePaypalButtons();
      return;
    }
    var buyer = readBuyer();
    if (!buyer) return;

    var ok = window.confirm(
      'You will sign in to Kharch Log with:\n\n' +
        buyer.displayName +
        '\n' +
        buyer.email +
        '\n' +
        buyer.phone +
        '\n\n' +
        'This must be your correct Google account. Continue to pay ' +
        priceLabel() +
        '?'
    );
    if (!ok) return;

    setStatus('Creating order…');
    if (payBtn) {
      payBtn.disabled = true;
      payBtn.classList.add('is-busy');
      payBtn.setAttribute('aria-busy', 'true');
    }

    try {
      sessionStorage.setItem('kharchlog_pay_email', buyer.email);
      sessionStorage.setItem('kharchlog_pay_firstName', buyer.firstName);
      sessionStorage.setItem('kharchlog_pay_lastName', buyer.lastName);
      sessionStorage.setItem('kharchlog_pay_phone', buyer.phone);
    } catch (e) {}

    createOrder({
      email: buyer.email,
      phone: buyer.phone,
      firstName: buyer.firstName,
      lastName: buyer.lastName,
      name: buyer.displayName,
      product: 'kharchlog',
      planType: 'lifetime',
      staging: !!(cfg.staging),
      currency: currency,
      staging: !!cfg.staging
    })
      .then(function (orderData) {
        if (payBtn) {
          payBtn.classList.remove('is-busy');
          payBtn.classList.add('is-success');
          payBtn.removeAttribute('aria-busy');
        }
        if (orderData && orderData.ok && orderData.provider === 'razorpay' && orderData.orderId) {
          return openRazorpayModal(buyer, orderData);
        }
        if (orderData && orderData.provider === 'paypal') {
          throw new Error('Use the PayPal buttons for USD checkout');
        }
        if (orderData && orderData.error) {
          throw new Error(orderData.error);
        }
        return openRazorpayModal(buyer, null);
      })
      .catch(function (e) {
        var msg = e && e.message ? e.message : 'Could not start checkout';
        setStatus(msg, true);
        if (payBtn) {
          payBtn.disabled = false;
          payBtn.classList.remove('is-busy');
          payBtn.classList.remove('is-success');
          payBtn.removeAttribute('aria-busy');
        }
      });
  }

  readEmailFromQuery();
  if (validateConfig() && payBtn) {
    payBtn.addEventListener('click', openCheckout);
  }
})();
