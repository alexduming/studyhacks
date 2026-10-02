// Offline payment regression tests. No application environment files are loaded.
// Install @electric-sql/pglite separately and set PAYMENT_TEST_PGLITE_MODULE if needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { test, before, after, beforeEach } = require('node:test');
const ts = require('typescript');
const { PGlite } = require(
  process.env.PAYMENT_TEST_PGLITE_MODULE || '@electric-sql/pglite'
);
const { drizzle } = require('drizzle-orm/pglite');
const { getTableConfig, PgDialect } = require('drizzle-orm/pg-core');
const { eq } = require('drizzle-orm');
const Stripe = require('stripe');
const root = path.resolve(__dirname, '..');
const engine = new PGlite();
const database = drizzle(engine);
const cache = new Map();
let sequence = 0;
let paymentService;
const blockedFetch = async () => {
  throw new Error('Network disabled in payment tests');
};
const originalFetch = global.fetch;
const stubs = {
  '@/core/db': { db: () => database },
  '@/shared/lib/hash': {
    getUuid: randomUUID,
    getSnowId: () => `test-${++sequence}`,
  },
  '@/shared/models/user': { appendUserToResult: async (x) => x },
};
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = fs.readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  const localRequire = (name) => {
    if (stubs[name]) return stubs[name];
    if (name === '@/config')
      throw new Error('Real configuration is forbidden in tests');
    if (
      name === '@/shared/services/payment' &&
      file.includes(`${path.sep}api${path.sep}`)
    )
      return paymentService;
    if (
      file.endsWith(`${path.sep}payment${path.sep}index.ts`) &&
      ['./creem', './paypal'].includes(name)
    )
      return {};
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/')
        ? path.join(root, 'src', name.slice(2))
        : path.resolve(path.dirname(file), name);
      const resolved = [
        base + '.ts',
        base + '.tsx',
        path.join(base, 'index.ts'),
      ].find(fs.existsSync);
      if (!resolved) throw new Error(`Unresolved test import: ${name}`);
      if (resolved.endsWith(`${path.sep}models${path.sep}user.ts`))
        return stubs['@/shared/models/user'];
      return load(resolved);
    }
    return require(name);
  };
  const fn = vm.runInThisContext(
    `(function(require,module,exports,fetch){${output}\n})`,
    { filename: file }
  );
  fn(localRequire, module, module.exports, blockedFetch);
  return module.exports;
}
const schema = load(path.join(root, 'src/config/db/schema.ts'));
const service = load(path.join(root, 'src/shared/services/payment.ts'));
const orderModel = load(path.join(root, 'src/shared/models/order.ts'));
const { StripeProvider } = load(
  path.join(root, 'src/extensions/payment/stripe.ts')
);
const signingSecret = 'whsec_offline_payment_verification';
let provider, route;
const q = (name) => `"${name.replaceAll('"', '""')}"`;
const tables = [
  schema.user,
  schema.order,
  schema.subscription,
  schema.credit,
  schema.commission,
];

before(async () => {
  await engine.waitReady;
  global.fetch = blockedFetch;
  const dialect = new PgDialect();
  for (const table of tables) {
    const config = getTableConfig(table);
    const columns = config.columns.map((c) => {
      let sql = `${q(c.name)} ${c.getSQLType()}`;
      if (c.primary) sql += ' PRIMARY KEY';
      else if (c.isUnique) sql += ' UNIQUE';
      if (c.notNull) sql += ' NOT NULL';
      if (c.default !== undefined) {
        const value =
          typeof c.default?.getSQL === 'function'
            ? dialect.sqlToQuery(c.default).sql
            : typeof c.default === 'string'
              ? `'${c.default.replaceAll("'", "''")}'`
              : String(c.default);
        sql += ` DEFAULT ${value}`;
      }
      return sql;
    });
    await engine.exec(`CREATE TABLE ${q(config.name)} (${columns.join(',')})`);
  }
  for (const table of tables) {
    const config = getTableConfig(table);
    for (const fk of config.foreignKeys) {
      const ref = fk.reference();
      await engine.exec(
        `ALTER TABLE ${q(config.name)} ADD FOREIGN KEY (${ref.columns.map((c) => q(c.name)).join(',')}) REFERENCES ${q(getTableConfig(ref.foreignTable).name)} (${ref.foreignColumns.map((c) => q(c.name)).join(',')})`
      );
    }
  }
  provider = new StripeProvider({
    secretKey: 'sk_test_offline_only',
    publishableKey: 'pk_test_offline_only',
    signingSecret,
  });
  provider.client.subscriptions.retrieve = async (id) => stripeSubscription(id);
  paymentService = {
    ...service,
    getPaymentService: async () => ({ getProvider: () => provider }),
  };
  route = load(
    path.join(root, 'src/app/api/payment/notify/[provider]/route.ts')
  );
});
after(async () => {
  global.fetch = originalFetch;
  await engine.close();
});
beforeEach(async () => {
  await engine.exec(
    'TRUNCATE "commission", "credit", "subscription", "order", "user" CASCADE'
  );
  await database.insert(schema.user).values([
    { id: 'buyer', name: 'Offline buyer', email: 'buyer@example.invalid' },
    {
      id: 'referrer',
      name: 'Offline referrer',
      email: 'referrer@example.invalid',
    },
  ]);
});
async function fixture(overrides = {}) {
  const [order] = await database
    .insert(schema.order)
    .values({
      id: 'order-1',
      orderNo: 'order-1',
      userId: 'buyer',
      userEmail: 'buyer@example.invalid',
      status: 'created',
      amount: 9900,
      currency: 'cny',
      productId: 'plus-monthly',
      paymentProvider: 'stripe',
      paymentSessionId: 'cs_offline',
      paymentType: 'one-time',
      paymentInterval: 'month',
      checkoutInfo: '{}',
      creditsAmount: 600,
      creditsValidDays: 30,
      referrerId: 'referrer',
      ...overrides,
    })
    .returning();
  return order;
}
function checkout(overrides = {}) {
  return {
    id: 'cs_offline',
    object: 'checkout.session',
    status: 'complete',
    payment_status: 'paid',
    amount_total: 9900,
    currency: 'cny',
    created: Math.floor(Date.now() / 1000),
    metadata: { order_no: 'order-1' },
    ...overrides,
  };
}
function request(type, object, options = {}) {
  const payload = JSON.stringify({
    id: options.id || 'evt_offline',
    type,
    data: { object },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: options.secret || signingSecret,
    timestamp: options.timestamp,
  });
  return new Request('https://offline.invalid/api/payment/notify/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': signature },
    body: payload,
  });
}
const notify = (type, object, options) =>
  route.POST(request(type, object, options), {
    params: Promise.resolve({ provider: 'stripe' }),
  });
const rows = (table) => database.select().from(table);
async function counts() {
  return {
    orders: (await rows(schema.order)).length,
    subscriptions: (await rows(schema.subscription)).length,
    credits: (await rows(schema.credit)).length,
    commissions: (await rows(schema.commission)).length,
  };
}
function stripeSubscription(id = 'sub_offline') {
  const start = Math.floor(Date.UTC(2026, 9, 1) / 1000),
    end = Math.floor(Date.UTC(2026, 10, 1) / 1000);
  return {
    id,
    status: 'active',
    metadata: {},
    items: {
      data: [
        {
          price: {
            id: 'price_offline',
            product: 'prod_offline',
            unit_amount: 9900,
            currency: 'cny',
          },
          plan: { interval: 'month', interval_count: 1 },
          current_period_start: start,
          current_period_end: end,
        },
      ],
    },
  };
}
async function subscribed() {
  await fixture({ referrerId: null, paymentType: 'subscription' });
  assert.equal(
    (
      await notify(
        'checkout.session.completed',
        checkout({ subscription: 'sub_offline' })
      )
    ).status,
    200
  );
  return (await rows(schema.subscription))[0];
}
function invoice(id = 'in_offline', overrides = {}) {
  return {
    id,
    object: 'invoice',
    amount_paid: 9900,
    currency: 'cny',
    status: 'paid',
    created: Math.floor(Date.UTC(2026, 9, 1) / 1000),
    billing_reason: 'subscription_cycle',
    lines: {
      data: [
        {
          parent: {
            subscription_item_details: { subscription: 'sub_offline' },
          },
        },
      ],
    },
    metadata: {},
    ...overrides,
  };
}

test('valid signed checkout grants one membership, credit and commission', async () => {
  await fixture();
  assert.equal(
    (await notify('checkout.session.completed', checkout())).status,
    200
  );
  assert.deepEqual(await counts(), {
    orders: 1,
    subscriptions: 1,
    credits: 1,
    commissions: 1,
  });
  assert.equal((await rows(schema.order))[0].status, 'paid');
  assert.equal((await rows(schema.credit))[0].remainingCredits, 600);
});
test('repeated event and separate event IDs do not issue duplicate rights', async () => {
  await fixture();
  for (const id of ['evt_a', 'evt_a', 'evt_b'])
    assert.equal(
      (await notify('checkout.session.completed', checkout(), { id })).status,
      200
    );
  assert.deepEqual(await counts(), {
    orders: 1,
    subscriptions: 1,
    credits: 1,
    commissions: 1,
  });
});
test('callback and webhooks using stale orders share the transaction guard', async () => {
  const order = await fixture();
  const event = await provider.getPaymentEvent({
    req: request('checkout.session.completed', checkout()),
  });
  await Promise.all(
    Array.from({ length: 5 }, () =>
      service.handleCheckoutSuccess({ order, session: event.paymentSession })
    )
  );
  assert.deepEqual(await counts(), {
    orders: 1,
    subscriptions: 1,
    credits: 1,
    commissions: 1,
  });
  assert.equal((await rows(schema.subscription))[0].status, 'active');
  assert.equal((await rows(schema.credit))[0].status, 'active');
});
test('commission failure rolls back payment, rights and credit; retry succeeds', async () => {
  await fixture();
  await engine.exec(
    `CREATE FUNCTION reject_test_commission() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'offline injected failure'; END $$ LANGUAGE plpgsql; CREATE TRIGGER fail_commission BEFORE INSERT ON commission FOR EACH ROW EXECUTE FUNCTION reject_test_commission();`
  );
  try {
    assert.equal(
      (await notify('checkout.session.completed', checkout())).status,
      500
    );
    assert.deepEqual(await counts(), {
      orders: 1,
      subscriptions: 0,
      credits: 0,
      commissions: 0,
    });
    assert.equal((await rows(schema.order))[0].status, 'created');
  } finally {
    await engine.exec(
      'DROP TRIGGER fail_commission ON commission; DROP FUNCTION reject_test_commission()'
    );
  }
  assert.equal(
    (await notify('checkout.session.completed', checkout())).status,
    200
  );
  assert.equal((await rows(schema.credit)).length, 1);
});
test('late unpaid/expired response cannot downgrade an already paid order', async () => {
  const order = await fixture();
  await notify('checkout.session.completed', checkout());
  const event = await provider.getPaymentEvent({
    req: request(
      'checkout.session.completed',
      checkout({ status: 'expired', payment_status: 'unpaid' })
    ),
  });
  await service.handleCheckoutSuccess({ order, session: event.paymentSession });
  assert.equal((await rows(schema.order))[0].status, 'paid');
});
test('async success grants only after payment is paid', async () => {
  await fixture();
  assert.equal(
    (
      await notify(
        'checkout.session.completed',
        checkout({ payment_status: 'unpaid' })
      )
    ).status,
    200
  );
  assert.equal((await rows(schema.credit)).length, 0);
  assert.equal(
    (await notify('checkout.session.async_payment_succeeded', checkout()))
      .status,
    200
  );
  assert.equal((await rows(schema.credit)).length, 1);
});
for (const [name, override] of [
  ['amount', { amount_total: 1 }],
  ['currency', { currency: 'usd' }],
  ['checkout identity', { id: 'cs_other' }],
]) {
  test(`mismatched ${name} cannot fulfill an order`, async () => {
    await fixture();
    assert.equal(
      (await notify('checkout.session.completed', checkout(override))).status,
      500
    );
    assert.equal((await rows(schema.credit)).length, 0);
  });
}
test('invalid and stale signatures reject before mutation', async () => {
  await fixture();
  assert.equal(
    (
      await notify('checkout.session.completed', checkout(), {
        secret: 'whsec_wrong',
      })
    ).status,
    400
  );
  assert.equal(
    (await notify('checkout.session.completed', checkout(), { timestamp: 1 }))
      .status,
    400
  );
  assert.equal((await rows(schema.credit)).length, 0);
});
test('authenticated unrelated events are acknowledged without database writes', async () => {
  assert.equal(
    (await notify('checkout.session.expired', checkout())).status,
    200
  );
  assert.deepEqual(await counts(), {
    orders: 0,
    subscriptions: 0,
    credits: 0,
    commissions: 0,
  });
});
test('renewal invoice retried concurrently creates a single renewal order and credit', async () => {
  await subscribed();
  const responses = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      notify('invoice.payment_succeeded', invoice(), { id: `evt_invoice_${i}` })
    )
  );
  assert.ok(responses.every((r) => r.status === 200));
  assert.deepEqual(await counts(), {
    orders: 2,
    subscriptions: 1,
    credits: 2,
    commissions: 0,
  });
});
test('initial subscription invoice is not counted as a renewal', async () => {
  await subscribed();
  assert.equal(
    (
      await notify(
        'invoice.payment_succeeded',
        invoice('in_initial', { billing_reason: 'subscription_create' })
      )
    ).status,
    200
  );
  assert.equal((await rows(schema.credit)).length, 1);
});
test('late invoice keeps its own credit expiry without rewinding membership', async () => {
  await subscribed();
  const start = Date.UTC(2026, 7, 1) / 1000,
    end = Date.UTC(2026, 8, 1) / 1000;
  const payload = invoice('in_late', {
    lines: {
      data: [
        {
          parent: {
            subscription_item_details: { subscription: 'sub_offline' },
          },
          period: { start, end },
        },
      ],
    },
  });
  assert.equal(
    (await notify('invoice.payment_succeeded', payload)).status,
    200
  );
  assert.equal(
    (await rows(schema.subscription))[0].currentPeriodEnd.toISOString(),
    '2026-11-01T00:00:00.000Z'
  );
  const renewal = (await rows(schema.order)).find(
    (o) => o.invoiceId === 'in_late'
  );
  const credit = (await rows(schema.credit)).find(
    (c) => c.orderNo === renewal.orderNo
  );
  assert.equal(credit.expiresAt.toISOString(), '2026-09-01T00:00:00.000Z');
});
test('renewal without a payment identifier fails without issuing credits', async () => {
  const subscription = await subscribed();
  await assert.rejects(
    service.handleSubscriptionRenewal({
      subscription,
      session: { provider: 'stripe', paymentStatus: 'paid' },
    }),
    /identifier/
  );
  assert.equal((await rows(schema.credit)).length, 1);
});
test('subscription cancellation is safe to repeat', async () => {
  await subscribed();
  const payload = {
    ...stripeSubscription(),
    status: 'canceled',
    canceled_at: Math.floor(Date.now() / 1000),
  };
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await notify('customer.subscription.deleted', payload)).status,
      200
    );
  assert.equal((await rows(schema.subscription))[0].status, 'canceled');
  assert.equal((await rows(schema.credit)).length, 1);
});
test('yearly upgrade callbacks retry without duplicate top-ups', async () => {
  const source = await subscribed();
  const context = {
    mode: 'yearly_prorated',
    sourceSubscriptionNo: source.subscriptionNo,
    sourceProductId: 'plus-yearly',
    currentPeriodStart: '2026-10-01T00:00:00Z',
    currentPeriodEnd: '2027-10-01T00:00:00Z',
    currentCycleStart: '2026-10-01T00:00:00Z',
    currentCycleEnd: '2026-11-01T00:00:00Z',
    currentMonthNumber: 1,
    currentPlanAmount: 99900,
    targetPlanAmount: 199900,
    proratedAmount: 9900,
    immediateCreditsDelta: 1400,
  };
  const order = await fixture({
    id: 'upgrade',
    orderNo: 'upgrade',
    productId: 'pro-yearly',
    paymentInterval: 'year',
    referrerId: null,
    checkoutInfo: JSON.stringify({ upgradeContext: context }),
  });
  const event = await provider.getPaymentEvent({
    req: request(
      'checkout.session.completed',
      checkout({ metadata: { order_no: 'upgrade' } })
    ),
  });
  await Promise.all([
    service.handleCheckoutSuccess({ order, session: event.paymentSession }),
    service.handleCheckoutSuccess({ order, session: event.paymentSession }),
  ]);
  assert.equal((await rows(schema.credit)).length, 2);
  assert.equal(
    (await rows(schema.credit)).filter((c) => c.credits === 1400).length,
    1
  );
  assert.equal(
    (await rows(schema.subscription)).filter((s) => s.status === 'active')
      .length,
    1
  );
});
