import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  limit,
  onSnapshot,
  getDocFromServer,
  writeBatch,
  deleteField
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";
import { Product, UserProfile, Order, AdminAccount, CustomerReview } from "./types";

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with the provisioned database ID
export const db = getFirestore(
  app,
  firebaseConfig.firestoreDatabaseId || "(default)"
);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Error Handling Standard conforming to skill requirements
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
    },
    operationType,
    path,
  };
  console.error("Firestore Error:", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Validate Connection to Firestore on boot
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    console.log("✅ Firestore database connected successfully!");
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Firestore connection check: client is offline or network restricted.");
    } else {
      console.log("Firestore connection test ping completed:", error);
    }
    return false;
  }
}

// =========================================================================
// 1. USER ACCOUNTS DATABASE (Storing & Credential Matching on Login)
// =========================================================================

/**
 * Normalize phone numbers to match easily regardless of spaces/hyphens
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

export function normalizePhoneKey(phone: string): string {
  const digits = normalizePhone(phone);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Look up a customer in Firestore strictly by Email ID or Phone Number (never by name/username).
 */
export async function findUserByCredential(
  identifier: string,
  loginMethod?: "phone" | "email"
): Promise<UserProfile | null> {
  const trimmedEmail = normalizeEmail(identifier);
  if (!trimmedEmail) return null;

  const phoneKey = normalizePhoneKey(identifier);
  const looksLikeEmail = loginMethod === "email" || (!loginMethod && trimmedEmail.includes("@"));
  const looksLikePhone = loginMethod === "phone" || (!looksLikeEmail && phoneKey.length >= 7);

  try {
    // 1. Fast indexed Firestore lookup when normalized fields exist
    if (looksLikeEmail) {
      const emailSnap = await getDocs(
        query(collection(db, "users"), where("normalizedEmail", "==", trimmedEmail), limit(1))
      );
      if (!emailSnap.empty) {
        const d = emailSnap.docs[0];
        return { ...(d.data() as UserProfile), id: d.id };
      }
    } else if (looksLikePhone && phoneKey.length >= 7) {
      const phoneSnap = await getDocs(
        query(collection(db, "users"), where("normalizedPhone", "==", phoneKey), limit(1))
      );
      if (!phoneSnap.empty) {
        const d = phoneSnap.docs[0];
        return { ...(d.data() as UserProfile), id: d.id };
      }
    }

    // 2. Fallback scan for legacy customer docs created prior to normalizedEmail/normalizedPhone
    const usersSnapshot = await getDocs(collection(db, "users"));
    let matchedUser: UserProfile | null = null;

    usersSnapshot.forEach((docSnap) => {
      if (matchedUser) return;
      const data = docSnap.data() as UserProfile;

      const emailMatches =
        looksLikeEmail &&
        Boolean(data.email) &&
        normalizeEmail(data.email) === trimmedEmail;

      const rawPhoneMatches =
        looksLikePhone &&
        Boolean(data.phone) &&
        data.phone.trim().toLowerCase() === trimmedEmail;

      const cleanPhoneMatches =
        looksLikePhone &&
        phoneKey.length >= 7 &&
        Boolean(data.phone) &&
        normalizePhoneKey(data.phone) === phoneKey;

      if (emailMatches || rawPhoneMatches || cleanPhoneMatches) {
        matchedUser = { ...data, id: docSnap.id };
      }
    });

    return matchedUser;
  } catch (error) {
    console.error("Error looking up user by phone/email credential:", error);
    return null;
  }
}

/**
 * Check if a customer account already exists with the same Email ID or Phone Number
 */
export async function checkExistingUserDuplicate(params: {
  email: string;
  phone: string;
}): Promise<{ exists: boolean; message?: string }> {
  const targetEmail = normalizeEmail(params.email);
  const targetPhone = normalizePhoneKey(params.phone);

  try {
    if (targetEmail) {
      const qEmail = await getDocs(
        query(collection(db, "users"), where("normalizedEmail", "==", targetEmail), limit(1))
      );
      if (!qEmail.empty) {
        return {
          exists: true,
          message: "An account with this email ID already exists. Please login instead.",
        };
      }
    }

    if (targetPhone.length >= 7) {
      const qPhone = await getDocs(
        query(collection(db, "users"), where("normalizedPhone", "==", targetPhone), limit(1))
      );
      if (!qPhone.empty) {
        return {
          exists: true,
          message: "An account with this phone number already exists. Please login instead.",
        };
      }
    }

    // Fallback check for legacy docs without normalized fields
    const usersSnapshot = await getDocs(collection(db, "users"));
    for (const docSnap of usersSnapshot.docs) {
      const data = docSnap.data() as UserProfile;
      const existingEmail = data.email ? normalizeEmail(data.email) : "";
      const existingPhone = data.phone ? normalizePhoneKey(data.phone) : "";

      if (targetEmail && existingEmail === targetEmail) {
        return {
          exists: true,
          message: "An account with this email ID already exists. Please login instead.",
        };
      }

      if (
        targetPhone.length >= 7 &&
        existingPhone.length >= 7 &&
        existingPhone === targetPhone
      ) {
        return {
          exists: true,
          message: "An account with this phone number already exists. Please login instead.",
        };
      }
    }
    return { exists: false };
  } catch (error) {
    console.error("Error checking duplicate user:", error);
    return { exists: false };
  }
}

/**
 * Retrieve user by document ID
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const path = `users/${userId}`;
  try {
    const snap = await getDoc(doc(db, "users", userId));
    if (snap.exists()) {
      return { ...snap.data(), id: snap.id } as UserProfile;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Persist or update a user account in the Firestore database (without username)
 */
export async function saveUserProfile(user: UserProfile): Promise<void> {
  const path = `users/${user.id}`;
  try {
    const { ...userCopy } = user as UserProfile & { username?: unknown };
    delete userCopy.username;
    const cleanPayload = Object.fromEntries(
      Object.entries({
        ...userCopy,
        normalizedEmail: normalizeEmail(user.email || ""),
        normalizedPhone: normalizePhoneKey(user.phone || ""),
        updatedAt: new Date().toISOString(),
      }).filter(([, value]) => value !== undefined)
    );
    await setDoc(
      doc(db, "users", user.id),
      {
        ...cleanPayload,
        username: deleteField(),
      },
      { merge: true }
    );
    console.log(`Saved user account ${user.id} to Firestore.`);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Delete all customer accounts from the Firestore users collection
 */
export async function purgeAllCustomerAccounts(): Promise<number> {
  const path = "users";
  try {
    const snap = await getDocs(collection(db, path));
    if (snap.empty) return 0;
    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Subscribe in real time to registered customer profiles (/users)
 */
export function subscribeUsers(
  onUsers: (users: UserProfile[]) => void
): () => void {
  const path = "users";
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const usersList: UserProfile[] = [];
      snapshot.forEach((d) => {
        usersList.push({ ...(d.data() as UserProfile), id: d.id });
      });
      onUsers(usersList);
    },
    (error) => {
      console.warn("Users subscription:", error);
    }
  );
}

// =========================================================================
// 1B. SINGLE ADMIN ACCOUNT DATABASE (/admins/admin)
// =========================================================================

const SINGLE_ADMIN_DOC_ID = "admin";
const SINGLE_ADMIN_USERNAME = "admin";
const SINGLE_ADMIN_PASSWORD = "Darkchocolate1311_";

/**
 * Ensure exactly ONE admin account exists in Firestore (/admins/admin)
 */
export async function ensureSingleAdminAccount(): Promise<AdminAccount> {
  const path = `admins/${SINGLE_ADMIN_DOC_ID}`;
  try {
    const adminsSnap = await getDocs(collection(db, "admins"));
    let hasValidPrimary = false;
    const batch = writeBatch(db);
    let needsBatch = false;

    adminsSnap.forEach((d) => {
      const data = d.data() as Partial<AdminAccount>;
      if (
        d.id === SINGLE_ADMIN_DOC_ID &&
        data.username === SINGLE_ADMIN_USERNAME &&
        data.password === SINGLE_ADMIN_PASSWORD &&
        data.role === "admin"
      ) {
        hasValidPrimary = true;
      } else {
        batch.delete(d.ref);
        needsBatch = true;
      }
    });

    const primaryAdmin: AdminAccount = {
      id: SINGLE_ADMIN_DOC_ID,
      username: SINGLE_ADMIN_USERNAME,
      password: SINGLE_ADMIN_PASSWORD,
      role: "admin",
      createdAt: new Date().toISOString(),
    };

    if (!hasValidPrimary) {
      batch.set(doc(db, "admins", SINGLE_ADMIN_DOC_ID), primaryAdmin);
      needsBatch = true;
    }

    if (needsBatch) {
      await batch.commit();
    }

    return primaryAdmin;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Verify admin credentials against the single admin account in Firestore
 */
export async function verifyAdminCredentials(
  username: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const path = `admins/${SINGLE_ADMIN_DOC_ID}`;
  try {
    await ensureSingleAdminAccount();
    const snap = await getDoc(doc(db, "admins", SINGLE_ADMIN_DOC_ID));
    if (!snap.exists()) {
      return { ok: false, error: "Admin account not found in database." };
    }
    const admin = snap.data() as AdminAccount;
    if (
      username.trim() === admin.username &&
      password === admin.password
    ) {
      return { ok: true };
    }
    return { ok: false, error: "Invalid admin username or password." };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

// =========================================================================
// 2. ARTICLES & PRODUCTS DATABASE (Connected to Merchant Hub & Storefront)
// =========================================================================

/**
 * Subscribe in real time to the articles / products collection
 */
export function subscribeProducts(
  onProducts: (products: Product[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = "products";
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items: Product[] = [];
      snapshot.forEach((d) => {
        items.push({ ...(d.data() as Product), id: d.id });
      });
      onProducts(items);
    },
    (error) => {
      console.error("Products subscription error:", error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

/**
 * Seed initial catalog articles if the database collection is empty,
 * backfill new sample category cards (`prod_sample_*`) if missing, and
 * patch paired `backImage` / 2-photo entries onto existing t-shirt docs that lack `backImage`.
 */
export async function seedProductsIfEmpty(initialProducts: Product[]): Promise<boolean> {
  const path = "products";
  try {
    const snapshot = await getDocs(collection(db, path));
    const existingById = new Map<string, Product>();
    snapshot.docs.forEach((d) => {
      existingById.set(d.id, d.data() as Product);
    });

    if (snapshot.empty) {
      console.log(`Seeding Firestore products collection with ${initialProducts.length} articles...`);
      const batch = writeBatch(db);
      initialProducts.forEach((product) => {
        const ref = doc(db, "products", product.id);
        batch.set(ref, {
          ...product,
          updatedAt: new Date().toISOString(),
        });
      });
      await batch.commit();
      return true;
    }

    const batch = writeBatch(db);
    let hasChanges = false;
    // Backfill newly separated Women's Western samples & sync separated Men/Women collection labels
    initialProducts
      .filter((p) => !existingById.has(p.id) && (p.id.startsWith("prod_sample_womens_") || p.id.startsWith("prod_sample_")))
      .forEach((product) => {
        batch.set(doc(db, "products", product.id), {
          ...product,
          updatedAt: new Date().toISOString(),
        });
        hasChanges = true;
      });

    // Migrate legacy default catalog items (mixed "Men & Women" / missing collection) cleanly to separated collections
    initialProducts.forEach((defaultProd) => {
      const existing = existingById.get(defaultProd.id);
      if (!existing) return;

      const patch: Record<string, unknown> = {};
      if (!existing.collection && defaultProd.collection) {
        patch.collection = defaultProd.collection;
      }
      if (existing.category && /men\s*&\s*women/i.test(existing.category) && defaultProd.category) {
        patch.category = defaultProd.category;
        patch.name = defaultProd.name;
      } else if (existing.category && !existing.category.includes("(Men)") && !existing.category.includes("(Women)") && defaultProd.category) {
        patch.category = defaultProd.category;
      }
      if (defaultProd.backImage && !existing.backImage) {
        patch.backImage = defaultProd.backImage;
        patch.images =
          existing.images && existing.images.length > 1 && existing.images.includes(defaultProd.backImage)
            ? existing.images
            : defaultProd.images;
        patch.colors = defaultProd.colors;
      }

      if (Object.keys(patch).length > 0) {
        patch.updatedAt = new Date().toISOString();
        batch.set(doc(db, "products", defaultProd.id), patch, { merge: true });
        hasChanges = true;
      }
    });

    if (hasChanges) {
      await batch.commit();
      console.log("Synced separated Men's & Women's catalog to Firestore database!");
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error during product seeding check:", error);
    return false;
  }
}

/**
 * Save or update a single article in Firestore (from Merchant Hub)
 */
export async function saveProductDoc(product: Product): Promise<void> {
  const path = `products/${product.id}`;
  try {
    const cleanPayload: Record<string, unknown> = Object.fromEntries(
      Object.entries({
        ...product,
        updatedAt: new Date().toISOString(),
      }).filter(([, value]) => value !== undefined)
    );
    if (!product.backImage) {
      cleanPayload.backImage = deleteField();
    }
    await setDoc(doc(db, "products", product.id), cleanPayload, { merge: true });
    console.log(`Article ${product.id} (${product.name}) saved to Firestore.`);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Delete an article document from Firestore (from Merchant Hub)
 */
export async function deleteProductDoc(productId: string): Promise<void> {
  const path = `products/${productId}`;
  try {
    await deleteDoc(doc(db, "products", productId));
    console.log(`Article ${productId} deleted from Firestore.`);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Update stock count for an article (e.g. on checkout or restock)
 */
export async function updateProductStockDoc(productId: string, stockCount: number): Promise<void> {
  const path = `products/${productId}`;
  try {
    await setDoc(
      doc(db, "products", productId),
      {
        stockCount: Math.max(0, stockCount),
        isAvailable: stockCount > 0,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// =========================================================================
// 3. ORDERS DATABASE
// =========================================================================

/**
 * Persist an order to Firestore
 */
export async function saveOrderDoc(order: Order): Promise<void> {
  const path = `orders/${order.id}`;
  try {
    const cleanPayload = Object.fromEntries(
      Object.entries({
        ...order,
        updatedAt: new Date().toISOString(),
      }).filter(([, value]) => value !== undefined)
    );
    await setDoc(doc(db, "orders", order.id), cleanPayload, { merge: true });
    console.log(`Order ${order.id} saved to Firestore.`);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Subscribe in real time to the orders collection
 */
export function subscribeOrders(
  onOrders: (orders: Order[]) => void
): () => void {
  const path = "orders";
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const ordersList: Order[] = [];
      snapshot.forEach((d) => {
        ordersList.push({ ...(d.data() as Order), id: d.id });
      });
      // Sort newest first
      ordersList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onOrders(ordersList);
    },
    (error) => {
      console.warn("Orders subscription:", error);
    }
  );
}

// =========================================================================
// 4. CUSTOMER REVIEWS DATABASE (Merchant Hub Manual Reviews + Profile Link)
// =========================================================================

/**
 * Subscribe in real time to the customer reviews collection
 */
export function subscribeReviews(
  onReviews: (reviews: CustomerReview[]) => void
): () => void {
  const path = "reviews";
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: CustomerReview[] = [];
      snapshot.forEach((d) => {
        list.push({ ...(d.data() as CustomerReview), id: d.id });
      });
      list.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      onReviews(list);
    },
    (error) => {
      console.warn("Reviews subscription:", error);
    }
  );
}

/**
 * Publish or update a manual customer review in Firestore
 */
export async function saveReviewDoc(review: CustomerReview): Promise<void> {
  const path = `reviews/${review.id}`;
  try {
    const payload = Object.fromEntries(
      Object.entries({
        ...review,
        updatedAt: new Date().toISOString(),
      }).filter(([, value]) => value !== undefined)
    );
    await setDoc(doc(db, "reviews", review.id), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Delete a customer review from Firestore
 */
export async function deleteReviewDoc(reviewId: string): Promise<void> {
  const path = `reviews/${reviewId}`;
  try {
    await deleteDoc(doc(db, "reviews", reviewId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
