import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // Search users by name in admin dashboard
    index('idx_user_name').on(table.name),
    // Order users by registration time for latest users list
    index('idx_user_created_at').on(table.createdAt),
  ]
);

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('idx_session_user_id').on(table.userId)]
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [index('idx_account_user_id').on(table.userId)]
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [index('idx_verification_identifier').on(table.identifier)]
);

export const emailVerification = pgTable(
  'email_verification',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    token: text('token').notNull(),
    type: text('type').notNull(), // registration, password_reset
    attempts: integer('attempts').default(0).notNull(),
    isVerified: boolean('is_verified').default(false).notNull(),
    verifiedAt: timestamp('verified_at'),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastSentAt: timestamp('last_sent_at'),
    inviteCode: text('invite_code'),
  },
  (table) => [
    index('idx_email_verification_email').on(table.email),
    index('idx_email_verification_token').on(table.token),
  ]
);

export const role = pgTable(
  'role',
  {
    id: text('id').primaryKey(),
    name: text('name').unique().notNull(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    sort: integer('sort').notNull(),
  },
  (table) => [index('idx_role_name').on(table.name)]
);

export const permission = pgTable(
  'permission',
  {
    id: text('id').primaryKey(),
    code: text('code').unique().notNull(), // e.g., 'admin.users.read'
    resource: text('resource').notNull(), // e.g., 'users', 'posts'
    action: text('action').notNull(), // e.g., 'read', 'write', 'delete'
    title: text('title').notNull(), // Display name, e.g., 'Read Users'
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('idx_permission_code').on(table.code)]
);

export const rolePermission = pgTable(
  'role_permission',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    permissionId: text('permission_id')
      .notNull()
      .references(() => permission.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_role_permission_role').on(table.roleId),
    uniqueIndex('idx_role_permission_unique').on(
      table.roleId,
      table.permissionId
    ),
  ]
);

export const userRole = pgTable(
  'user_role',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('idx_user_role_user').on(table.userId),
    uniqueIndex('idx_user_role_unique').on(table.userId, table.roleId),
  ]
);

export const credit = pgTable(
  'credit',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userEmail: text('user_email'),
    orderNo: text('order_no'),
    subscriptionNo: text('subscription_no'),
    transactionNo: text('transaction_no').unique().notNull(),
    transactionType: text('transaction_type').notNull(), // grant, consume
    transactionScene: text('transaction_scene'), // payment, subscription, renewal, gift, award
    credits: integer('credits').notNull(), // positive for grant, negative for consume
    remainingCredits: integer('remaining_credits').default(0).notNull(), // for grant: remaining credits; for consume: 0
    status: text('status').notNull(), // active, expired, deleted
    description: text('description'),
    metadata: text('metadata'),
    consumedDetail: text('consumed_detail'), // for consume: detail of consumed credits (json)
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_credit_user_created').on(table.userId, table.createdAt),
    index('idx_credit_user_remaining_expires').on(
      table.userId,
      table.remainingCredits,
      table.expiresAt
    ),
  ]
);

export const taxonomy = pgTable(
  'taxonomy',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').unique().notNull(),
    type: text('type').notNull(), // category, tag
    description: text('description'),
    count: integer('count').default(0).notNull(),
    parentId: text('parent_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('idx_taxonomy_type').on(table.type),
    index('idx_taxonomy_slug').on(table.slug),
  ]
);

export const post = pgTable(
  'post',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    slug: text('slug').unique().notNull(),
    type: text('type').notNull(),
    title: text('title'),
    description: text('description'),
    image: text('image'),
    content: text('content'),
    categories: text('categories'),
    tags: text('tags'),
    authorName: text('author_name'),
    authorImage: text('author_image'),
    status: text('status').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at'),
    sort: integer('sort').default(0).notNull(),
  },
  (table) => [
    // Composite: Query posts by type and status
    // Can also be used for: WHERE type = ? (left-prefix)
    index('idx_post_type_status').on(table.type, table.status),
  ]
);

export const order = pgTable(
  'order',
  {
    id: text('id').primaryKey(),
    orderNo: text('order_no').unique().notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userEmail: text('user_email'), // checkout user email
    status: text('status').notNull(), // created, paid, failed
    amount: integer('amount').notNull(), // checkout amount in cents
    currency: text('currency').notNull(), // checkout currency
    productId: text('product_id'),
    productName: text('product_name'), // product name
    planName: text('plan_name'), // Added
    paymentType: text('payment_type'), // one_time, subscription
    paymentInterval: text('payment_interval'), // day, week, month, year
    paymentProvider: text('payment_provider').notNull(),
    paymentProductId: text('payment_product_id'), // Added
    paymentSessionId: text('payment_session_id'),
    checkoutInfo: text('checkout_info').notNull(), // checkout request info
    checkoutUrl: text('checkout_url'), // checkout url
    callbackUrl: text('callback_url'), // callback url, after handle callback
    checkoutResult: text('checkout_result'), // checkout result
    paymentResult: text('payment_result'), // payment result
    transactionId: text('transaction_id'), // Added
    subscriptionId: text('subscription_id'), // provider subscription id
    subscriptionNo: text('subscription_no'), // Added
    subscriptionResult: text('subscription_result'), // provider subscription result
    discountCode: text('discount_code'), // discount code
    discountAmount: integer('discount_amount'), // discount amount in cents
    discountCurrency: text('discount_currency'), // discount currency
    paymentEmail: text('payment_email'), // actual payment email
    paymentAmount: integer('payment_amount'), // actual payment amount
    paymentCurrency: text('payment_currency'), // actual payment currency
    paymentUserName: text('payment_user_name'), // Added
    paymentUserId: text('payment_user_id'), // Added
    paidAt: timestamp('paid_at'), // paid at
    invoiceId: text('invoice_id'), // Added
    invoiceUrl: text('invoice_url'), // Added
    creditsAmount: integer('credits_amount'), // credits amount (granted)
    creditsValidDays: integer('credits_valid_days'), // Added
    description: text('description'), // order description
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_order_user').on(table.userId),
    index('idx_order_status').on(table.status),
    index('idx_order_no').on(table.orderNo),
    index('idx_order_created_at').on(table.createdAt),
  ]
);

export const subscription = pgTable(
  'subscription',
  {
    id: text('id').primaryKey(),
    subscriptionNo: text('subscription_no'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userEmail: text('user_email'),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    status: text('status').notNull(), // active, canceled, expired
    planId: text('plan_id').notNull(),
    planName: text('plan_name'),
    productId: text('product_id'),
    productName: text('product_name'),
    amount: integer('amount'),
    currency: text('currency'),
    interval: text('interval'),
    intervalCount: integer('interval_count'),
    paymentProvider: text('payment_provider'),
    paymentProductId: text('payment_product_id'),
    paymentUserId: text('payment_user_id'),
    subscriptionId: text('subscription_id'), // provider subscription id
    subscriptionResult: text('subscription_result'),
    trialPeriodDays: integer('trial_period_days'),
    billingUrl: text('billing_url'),
    creditsAmount: integer('credits_amount'),
    creditsValidDays: integer('credits_valid_days'),
    currentPeriodStart: timestamp('current_period_start').notNull(),
    currentPeriodEnd: timestamp('current_period_end').notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
    canceledAt: timestamp('canceled_at'),
    canceledEndAt: timestamp('canceled_end_at'),
    canceledReason: text('canceled_reason'),
    canceledReasonType: text('canceled_reason_type'),
    endedAt: timestamp('ended_at'),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_subscription_user').on(table.userId),
    index('idx_subscription_status').on(table.status),
  ]
);

export const notification = pgTable(
  'notification',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // system, message
    title: text('title').notNull(),
    content: text('content'),
    link: text('link'),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('idx_notification_user').on(table.userId),
    index('idx_notification_is_read').on(table.isRead),
  ]
);

export const apiKey = pgTable(
  'api_key',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    key: text('key').unique().notNull(),
    description: text('description'),
    status: text('status').default('active').notNull(), // active, disabled
    lastUsedAt: timestamp('last_used_at'),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('idx_api_key_user').on(table.userId),
    index('idx_api_key_value').on(table.key),
  ]
);

export const file = pgTable(
  'file',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    path: text('path').notNull(),
    url: text('url').notNull(),
    size: integer('size').notNull(),
    type: text('type').notNull(), // image, video, document, etc.
    mimeType: text('mime_type'),
    provider: text('provider').notNull(), // r2, s3, local
    bucket: text('bucket'),
    metadata: text('metadata'),
    hash: text('hash'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_file_user').on(table.userId),
    index('idx_file_path').on(table.path),
  ]
);

export const systemConfig = pgTable('config', {
  name: text('name').primaryKey(),
  value: text('value'),
});

export const aiTask = pgTable(
  'ai_task',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    taskId: text('task_id'),
    mediaType: text('media_type').notNull(),
    provider: text('provider').notNull(),
    model: text('model'),
    prompt: text('prompt'),
    options: text('options'), // JSON string
    status: text('status').notNull(),
    taskInfo: text('task_info'), // JSON string
    taskResult: text('task_result'), // JSON string
    costCredits: integer('cost_credits').default(0),
    scene: text('scene'),
    creditId: text('credit_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_ai_task_user').on(table.userId),
    index('idx_ai_task_status').on(table.status),
    index('idx_ai_task_created_at').on(table.createdAt),
    index('idx_ai_task_task_id').on(table.taskId),
  ]
);

export const chat = pgTable(
  'chat',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    model: text('model').notNull(),
    provider: text('provider').notNull(),
    title: text('title').notNull().default(''),
    parts: text('parts').notNull(),
    metadata: text('metadata'),
    content: text('content'),
  },
  (table) => [index('idx_chat_user_status').on(table.userId, table.status)]
);

export const chatMessage = pgTable(
  'chat_message',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    chatId: text('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    role: text('role').notNull(), // user, assistant, system
    parts: text('parts').notNull(), // json string of parts
    metadata: text('metadata'),
    model: text('model').notNull(),
    provider: text('provider').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('idx_chat_message_chat').on(table.chatId),
    index('idx_chat_message_user').on(table.userId),
  ]
);

export const apikey = pgTable(
  'apikey',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    key: text('key').unique().notNull(),
    title: text('title').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_apikey_user').on(table.userId),
    index('idx_apikey_key').on(table.key),
  ]
);

export const invitation = pgTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    inviterEmail: text('inviter_email'),
    inviteeId: text('invitee_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    inviteeEmail: text('invitee_email'),
    code: text('code').notNull(),
    status: text('status').notNull().default('pending'), // pending, accepted
    rewardAmount: integer('reward_amount').default(0), // Credits earned by inviter
    inviteeRewardAmount: integer('invitee_reward_amount').default(0), // Credits earned by invitee
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    acceptedAt: timestamp('accepted_at'),
    inviterCreditId: text('inviter_credit_id'),
    inviteeCreditId: text('invitee_credit_id'),
    note: text('note'),
  },
  (table) => [
    index('idx_invitation_inviter').on(table.inviterId),
    index('idx_invitation_code').on(table.code),
    index('idx_invitation_invitee_email').on(table.inviteeEmail),
  ]
);

export const redemptionCode = pgTable(
  'redemption_code',
  {
    id: text('id').primaryKey(),
    code: text('code').unique().notNull(),
    credits: integer('credits').notNull(),
    status: text('status').notNull().default('active'), // active, used
    userId: text('user_id'),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: text('created_by'),
    maxUses: integer('max_uses').default(1).notNull(),
    usedCount: integer('used_count').default(0).notNull(),
    expiresAt: timestamp('expires_at'),
    creditValidityDays: integer('credit_validity_days').default(30),
  },
  (table) => [
    index('idx_redemption_code_status').on(table.code, table.status),
    index('idx_redemption_code_created_at').on(table.createdAt),
  ]
);

export const redemptionRecord = pgTable(
  'redemption_record',
  {
    id: text('id').primaryKey(),
    codeId: text('code_id')
      .notNull()
      .references(() => redemptionCode.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    redeemedAt: timestamp('redeemed_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_redemption_record_unique').on(table.userId, table.codeId),
  ]
);

export const presentation = pgTable(
  'presentation',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    content: text('content'), // JSON string for slides content
    status: text('status').notNull(), // generating, completed, failed
    kieTaskId: text('kie_task_id'), // task id from KIE/RPA service if applicable
    styleId: text('style_id'), // style template id
    thumbnailUrl: text('thumbnail_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('idx_presentation_user').on(table.userId),
    index('idx_presentation_created_at').on(table.createdAt),
  ]
);
