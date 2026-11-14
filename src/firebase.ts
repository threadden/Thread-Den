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

/**
 * Look up a user in Firestore matching their username/name, email, or phone credentials
 */
export async function findUserByCredential(identifier: string): Promise<UserProfile | null> {
  const trimmed = identifier.trim().toLowerCase();
  if (!trimmed) return null;
  const cleanPhone = normalizePhone(identifier);

  try {
    const usersSnapshot = await getDocs(collection(db, "users"));
    let matchedUser: UserProfile | null = null;

    usersSnapshot.forEach((docSnap) => {
      if (matchedUser) return;
      const data = docSnap.data() as UserProfile;

      const usernameMatches =
        data.username && data.username.trim().toLowerCase() === trimmed;
      const nameMatches = data.name && data.name.trim().toLowerCase() === trimmed;
      const emailMatches = data.email && data.email.trim().toLowerCase() === trimmed;
      const rawPhoneMatches = data.phone && data.phone.trim().toLowerCase() === trimmed;
      const cleanPhoneMatches =
        cleanPhone.length >= 7 &&
        data.phone &&
        normalizePhone(data.phone).endsWith(cleanPhone.slice(-10));

      if (
        usernameMatches ||
        nameMatches ||
        emailMatches ||
        rawPhoneMatches ||
        cleanPhoneMatches
      ) {
        matchedUser = { ...data, id: docSnap.id };
      }
    });

    return matchedUser;
  } catch (error) {
    console.error("Error looking up user by credential:", error);
    return null;
  }
}

/**
 * Check if a customer account already exists with the same username/name, email, or phone
 */
export async function checkExistingUserDuplicate(params: {
  name: string;
  email: string;
  phone: string;
}): Promise<{ exists: boolean; message?: string }> {
  const targetName = params.name.trim().toLowerCase();
  const targetEmail = params.email.trim().toLowerCase();
  const targetPhone = normalizePhone(params.phone);

  try {
    const usersSnapshot = await getDocs(collection(db, "users"));
    for (const docSnap of usersSnapshot.docs) {
      const data = docSnap.data() as UserProfile;
      const existingEmail = data.email?.trim().toLowerCase() || "";
      const existingName = (data.username || data.name || "").trim().toLowerCase();
      const existingDisplayName = data.name?.trim().toLowerCase() || "";
      const existingPhone = data.phone ? normalizePhone(data.phone) : "";

      if (targetEmail && existingEmail === targetEmail) {
        return {
          exists: true,
          message: "An account with this email ID already exists. Please sign in instead.",
        };
      }

      if (
        targetPhone.length >= 7 &&
        existingPhone.length >= 7 &&
        existingPhone.slice(-10) === targetPhone.slice(-10)
      ) {
        return {
          exists: true,
          message: "An account with this phone number already exists. Please sign in instead.",
        };
      }

      if (targetName && (existingName === targetName || existingDisplayName === targetName)) {
        return {
          exists: true,
          message: "This name/username is already registered. Please sign in or choose a different name.",
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
 * Persist or update a user account in the Firestore database
 */
export async function saveUserProfile(user: UserProfile): Promise<void> {
  const path = `users/${user.id}`;
  try {
    const payload = Object.fromEntries(
      Object.entries({
        ...user,
        updatedAt: new Date().toISOString(),
      }).filter(([, value]) => value !== undefined)
    );
    await setDoc(doc(db, "users", user.id), payload, { merge: true });
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
    const hasAnySample = initialProducts.some((p) => p.id.startsWith("prod_sample_") && existingById.has(p.id));

    if (!hasAnySample) {
      initialProducts
        .filter((p) => p.id.startsWith("prod_sample_") && !existingById.has(p.id))
        .forEach((product) => {
          batch.set(doc(db, "products", product.id), {
            ...product,
            updatedAt: new Date().toISOString(),
          });
          hasChanges = true;
        });
    }

    // Backfill 2-photo backImage on existing default t-shirt docs if not yet present
    initialProducts.forEach((defaultProd) => {
      if (!defaultProd.backImage) return;
      const existing = existingById.get(defaultProd.id);
      if (existing && !existing.backImage) {
        const nextImages =
          existing.images && existing.images.length > 1 && existing.images.includes(defaultProd.backImage)
            ? existing.images
            : defaultProd.images;
        batch.set(
          doc(db, "products", defaultProd.id),
          {
            backImage: defaultProd.backImage,
            images: nextImages,
            colors: defaultProd.colors,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        hasChanges = true;
      }
    });

    if (hasChanges) {
      await batch.commit();
      console.log("Synced catalog back-print images to Firestore database!");
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
