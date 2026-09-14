(function () {
  var cfg = window.KHARCHLOG_PAY || {};
  var firstNameInput = document.getElementById('firstName');
  var lastNameInput = document.getElementById('lastName');
  var emailInput = document.getElementById('email');
  var phoneInput = document.getElementById('phone');
  var payBtn = document.getElementById('payBtn');
  var statusEl = document.getElementById('status');
  var priceEl = document.getElementById('pay-price');
  var params = new URLSearchParams(window.location.search);
  var currency = (params.get('currency') || cfg.currency || 'INR').toUpperCase() === 'USD' ? 'USD' : 'INR';

  function priceLabel() {
    return currency === 'USD' ? '$2' : '₹149';
  }

  function syncCurrencyUi() {
    if (priceEl) {
      priceEl.innerHTML = priceLabel() + ' <span class="pay-once">one-time</span>';
    }
    document.querySelectorAll('.pay-currency__btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-currency') === currency);
    });
  }

  syncCurrencyUi();
  document.querySelectorAll('.pay-currency__btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
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

  /** Reject empty / digits / keyboard smash / blocklist junk. Allows Latin + Devanagari names. */
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

  /**
   * Require a real phone with country code (E.164).
   * 10-digit Indian mobiles (6–9…) are accepted and stored as +91…
   * Returns "+<digits>" or null.
   */
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
    var params = new URLSearchParams(window.location.search);
    var e = (params.get('email') || '').trim();
    if (e && emailInput) emailInput.value = e;
  }

  function validateConfig() {
    if (!cfg.trackerUrl) {
      setStatus('Missing trackerUrl in pay/config.js', true);
      if (payBtn) payBtn.disabled = true;
      return false;
    }
    if (!cfg.razorpayKeyId) {
      setStatus('Payment is not configured yet. Try again shortly.', true);
      if (payBtn) payBtn.disabled = true;
      return false;
    }
    if (typeof Razorpay !== 'function') {
      setStatus('Razorpay SDK failed to load — refresh and try again', true);
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

  function openRazorpayModal(buyer, orderData) {
    var keyId = (orderData && orderData.razorpayKeyId) || cfg.razorpayKeyId;
    var amount = (orderData && orderData.amount) || cfg.amountPaise;
    var currency = (orderData && orderData.currency) || cfg.currency || 'INR';
    var orderId = orderData && orderData.orderId;
    var fullName = [buyer.firstName, buyer.lastName].filter(Boolean).join(' ');

    if (!keyId || !amount) {
      return Promise.reject(new Error('Payment is not configured yet'));
    }

    setStatus('Opening checkout…');

    return new Promise(function (resolve, reject) {
      var options = {
        key: keyId,
        amount: amount,
        currency: currency,
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
    var firstName = normalizeName((firstNameInput && firstNameInput.value) || '');
    var lastName = normalizeName((lastNameInput && lastNameInput.value) || '');
    var email = (emailInput.value || '').trim().toLowerCase();
    var phone = normalizePhone((phoneInput && phoneInput.value) || '');

    if (!isRealPersonName(firstName)) {
      setStatus('Enter a real first name (letters only, not junk like “test” / “asdf”)', true);
      if (firstNameInput) firstNameInput.focus();
      return;
    }
    if (lastName && !isRealPersonName(lastName)) {
      setStatus('Enter a real last name, or leave it blank', true);
      if (lastNameInput) lastNameInput.focus();
      return;
    }
    if (!email || email.indexOf('@') < 1 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('Enter the Google email you will use to sign in to the app', true);
      emailInput.focus();
      return;
    }
    if (!phone) {
      setStatus('Enter a valid phone with country code (e.g. +91 98765 43210)', true);
      if (phoneInput) phoneInput.focus();
      return;
    }

    var buyer = { firstName: firstName, lastName: lastName, email: email, phone: phone };
    var displayName = [firstName, lastName].filter(Boolean).join(' ');
    var ok = window.confirm(
      'You will sign in to Kharch Log with:\n\n' +
        displayName +
        '\n' +
        email +
        '\n' +
        phone +
        '\n\n' +
        'This must be your correct Google account. Continue to pay ' + priceLabel() + '?'
    );
    if (!ok) return;

    setStatus('Creating order…');
    if (payBtn) {
      payBtn.disabled = true;
      payBtn.classList.add('is-busy');
      payBtn.setAttribute('aria-busy', 'true');
    }

    try {
      sessionStorage.setItem('kharchlog_pay_email', email);
      sessionStorage.setItem('kharchlog_pay_firstName', firstName);
      sessionStorage.setItem('kharchlog_pay_lastName', lastName);
      sessionStorage.setItem('kharchlog_pay_phone', phone);
    } catch (e) {}

    createOrder({
      email: email,
      phone: phone,
      firstName: firstName,
      lastName: lastName,
      name: displayName,
      product: 'kharchlog',
      planType: 'lifetime',
      staging: !!(cfg.staging),
      currency: currency
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
