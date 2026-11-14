import React, { useState, useEffect } from "react";
import {
  X,
  User,
  ShieldCheck,
  Lock,
  Mail,
  Phone,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  ShoppingBag,
  Check,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { UserProfile } from "../types";
import {
  checkExistingUserDuplicate,
  findUserByCredential,
  saveUserProfile,
  verifyAdminCredentials,
} from "../firebase";

// Streetwear avatar presets for customer signup
const AVATAR_PRESETS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=250",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=250",
  "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=250",
  "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&q=80&w=250",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=250",
];

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerLogin: (user: UserProfile) => void;
  onAdminLogin: () => void;
  theme: "dark" | "light";
  brandName: string;
  initialRole?: "customer" | "admin";
  initialCustomerMode?: "signin" | "signup";
  checkoutContext?: {
    itemCount: number;
    totalAmount: number;
    currencySymbol: string;
  } | null;
}

export default function AuthModal({
  isOpen,
  onClose,
  onCustomerLogin,
  onAdminLogin,
  theme,
  brandName,
  initialRole = "customer",
  initialCustomerMode = "signin",
  checkoutContext = null,
}: AuthModalProps) {
  // Primary Role selection: "customer" vs "admin" (Defaults to "customer")
  const [role, setRole] = useState<"customer" | "admin">("customer");

  // Customer sub-mode: "signin" (Customer Login) vs "signup" (Customer Sign Up)
  const [customerMode, setCustomerMode] = useState<"signin" | "signup">("signin");

  // Customer Sign In state
  const [customerLoginUsername, setCustomerLoginUsername] = useState("");
  const [customerLoginPassword, setCustomerLoginPassword] = useState("");
  const [showCustomerLoginPassword, setShowCustomerLoginPassword] = useState(false);

  // Customer Sign Up state
  const [signupName, setSignupName] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_PRESETS[0]);

  // Admin Login state (Merchant Hub Back-Office)
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [isCheckingDb, setIsCheckingDb] = useState(false);

  // Feedback errors
  const [customerError, setCustomerError] = useState("");

  // Whenever modal opens, reset errors and apply initial mode
  useEffect(() => {
    if (isOpen) {
      setRole(initialRole);
      setCustomerMode(initialCustomerMode);
      setCustomerError("");
      setAdminError("");
    }
  }, [isOpen, initialRole, initialCustomerMode]);

  if (!isOpen) return null;

  const isDark = theme === "dark";

  // -------------------------------------------------------------
  // CUSTOMER SIGN IN: SUBMIT (Username + Password against Firestore)
  // -------------------------------------------------------------
  const handleCustomerLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomerError("");

    const usernameValue = customerLoginUsername.trim();
    if (!usernameValue) {
      setCustomerError("Please enter your username (name, email, or phone number).");
      return;
    }

    if (!customerLoginPassword) {
      setCustomerError("Please enter your password.");
      return;
    }

    setIsCheckingDb(true);
    try {
      const matchedUser = await findUserByCredential(usernameValue);

      if (!matchedUser) {
        setCustomerError("No customer account found with that username. Please sign up first.");
        return;
      }

      if (!matchedUser.password) {
        setCustomerError("This account does not have a password set. Please register a new password account.");
        return;
      }

      if (matchedUser.password !== customerLoginPassword) {
        setCustomerError("Incorrect password. Please check your password and try again.");
        return;
      }

      onCustomerLogin(matchedUser);
    } catch (err) {
      console.error("Firestore customer login error:", err);
      setCustomerError("Unable to access the account database. Please try again.");
    } finally {
      setIsCheckingDb(false);
    }
  };

  // -------------------------------------------------------------
  // CUSTOMER SIGN UP: SUBMIT (Save Name, Phone, Email & Password)
  // -------------------------------------------------------------
  const handleCustomerSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomerError("");

    const cleanName = signupName.trim();
    const cleanPhone = signupPhone.trim();
    const cleanEmail = signupEmail.trim();
    const cleanPassword = signupPassword;

    if (!cleanName) {
      setCustomerError("Please enter your name (this will also be your login username).");
      return;
    }

    const digitsOnly = cleanPhone.replace(/[^0-9]/g, "");
    if (digitsOnly.length < 8) {
      setCustomerError("Please enter a valid phone number (at least 8 digits).");
      return;
    }

    if (!cleanEmail || !cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      setCustomerError("Please enter a valid email ID.");
      return;
    }

    if (!cleanPassword || cleanPassword.length < 4) {
      setCustomerError("Please create a password (at least 4 characters).");
      return;
    }

    setIsCheckingDb(true);
    try {
      const duplicateCheck = await checkExistingUserDuplicate({
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
      });

      if (duplicateCheck.exists) {
        setCustomerError(duplicateCheck.message || "An account with these details already exists. Please sign in.");
        return;
      }

      const newUser: UserProfile = {
        id: `usr_${Date.now().toString().slice(-6)}`,
        name: cleanName,
        username: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        password: cleanPassword,
        avatarUrl: selectedAvatar,
        createdAt: new Date().toISOString().split("T")[0],
        savedAddresses: [],
        bankDetails: {},
      };

      await saveUserProfile(newUser);
      onCustomerLogin(newUser);
    } catch (err) {
      console.error("Firestore user registration error:", err);
      setCustomerError("Failed to save your account in the database. Please try again.");
    } finally {
      setIsCheckingDb(false);
    }
  };

  // -------------------------------------------------------------
  // ADMIN LOGIN SUBMIT (Single Admin Account verified in Firestore)
  // -------------------------------------------------------------
  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError("");

    if (!adminUsername.trim() || !adminPassword) {
      setAdminError("Please enter both admin username and password.");
      return;
    }

    setIsAdminLoading(true);
    try {
      const result = await verifyAdminCredentials(adminUsername, adminPassword);
      if (result.ok) {
        setAdminPassword("");
        onAdminLogin();
        onClose();
      } else {
        setAdminError(result.error || "Invalid admin username or password.");
      }
    } catch (err) {
      console.error("Admin authentication error:", err);
      setAdminError("Unable to verify admin credentials against database.");
    } finally {
      setIsAdminLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        {/* Backdrop Overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Unified Auth Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className={`relative w-full max-w-lg rounded-3xl shadow-2xl border overflow-hidden transition-all my-auto z-10 ${
            isDark
              ? "bg-zinc-900 border-zinc-800 text-zinc-100"
              : "bg-white border-zinc-200 text-zinc-900"
          }`}
          id="unified-auth-modal"
        >
          {/* Top Brand Header */}
          <div
            className={`px-6 py-4 border-b flex items-center justify-between ${
              isDark ? "border-zinc-800 bg-zinc-950/70" : "border-zinc-100 bg-zinc-50"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-2xl p-1 flex items-center justify-center shrink-0 border overflow-hidden ${
                  role === "admin"
                    ? isDark
                      ? "bg-amber-500/15 border-amber-500/30"
                      : "bg-amber-50 border-amber-200"
                    : isDark
                    ? "bg-zinc-950 border-zinc-800"
                    : "bg-white border-zinc-200 shadow-xs"
                }`}
              >
                <img
                  src={isDark ? "/assets/aistudio/logo_monogram_white.png" : "/assets/aistudio/logo_monogram_dark.png"}
                  alt={brandName}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.src = "/assets/aistudio/Logo_white_35762b07.png";
                    if (isDark) target.classList.add("invert");
                  }}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-black text-base sm:text-lg tracking-tight">
                    {brandName}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-extrabold uppercase tracking-wider ${
                      role === "admin"
                        ? "bg-amber-500 text-zinc-950 font-black"
                        : "bg-emerald-500 text-zinc-950 font-black"
                    }`}
                  >
                    {role === "admin" ? "Merchant Gate" : "Member Gate"}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {checkoutContext ? "Sign in or sign up to finalize your checkout" : "Authentication gateway for shoppers & administrators"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-xl transition-all ${
                isDark
                  ? "hover:bg-zinc-800 text-zinc-400 hover:text-white"
                  : "hover:bg-zinc-200 text-zinc-500 hover:text-zinc-950"
              }`}
              id="close-auth-modal-btn"
              title="Close window"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* CHECKOUT CONTEXT BANNER */}
          {checkoutContext && (
            <div className="bg-gradient-to-r from-emerald-600/20 via-emerald-500/15 to-transparent border-b border-emerald-500/20 px-6 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <ShoppingBag className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-zinc-200 font-medium">
                  Completing order: <strong className="text-white font-mono">{checkoutContext.itemCount} items</strong> ({checkoutContext.currencySymbol}{checkoutContext.totalAmount.toLocaleString()})
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
                Account Required
              </span>
            </div>
          )}

          <div className="p-5 sm:p-6 space-y-5 max-h-[78vh] overflow-y-auto">
            {/* 1. ROLE SELECTOR (CUSTOMER vs ADMIN) */}
            <div className="space-y-1.5">
              <label
                className={`block text-[10px] font-mono uppercase font-bold tracking-wider ${
                  isDark ? "text-zinc-400" : "text-zinc-500"
                }`}
              >
                Select Account Type
              </label>

              <div
                className={`grid grid-cols-2 p-1.5 rounded-2xl border ${
                  isDark ? "bg-zinc-950 border-zinc-800" : "bg-zinc-100 border-zinc-200"
                }`}
                id="role-selector-container"
              >
                {/* CUSTOMER OPTION (DEFAULT) */}
                <button
                  type="button"
                  onClick={() => {
                    setRole("customer");
                    setCustomerError("");
                  }}
                  className={`py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all relative ${
                    role === "customer"
                      ? isDark
                        ? "bg-zinc-900 text-white shadow-md border border-zinc-700/80"
                        : "bg-white text-zinc-950 shadow-md border border-zinc-200"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                  }`}
                  id="select-customer-role-btn"
                >
                  <User className={`w-4 h-4 ${role === "customer" ? "text-emerald-500" : "text-zinc-400"}`} />
                  <div className="text-left">
                    <div className="flex items-center gap-1.5">
                      <span>Customer</span>
                      {role === "customer" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      )}
                    </div>
                    <span className="text-[10px] opacity-60 block font-normal -mt-0.5">
                      Shopper &bull; Account Access
                    </span>
                  </div>
                </button>

                {/* ADMIN OPTION (UNCHANGED) */}
                <button
                  type="button"
                  onClick={() => {
                    setRole("admin");
                    setAdminError("");
                  }}
                  className={`py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all relative ${
                    role === "admin"
                      ? isDark
                        ? "bg-zinc-900 text-amber-400 shadow-md border border-amber-500/40"
                        : "bg-white text-zinc-950 shadow-md border border-amber-400"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                  }`}
                  id="select-admin-role-btn"
                >
                  <ShieldCheck className={`w-4 h-4 ${role === "admin" ? "text-amber-400" : "text-zinc-400"}`} />
                  <div className="text-left">
                    <div className="flex items-center gap-1.5">
                      <span>Admin Login</span>
                      {role === "admin" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      )}
                    </div>
                    <span className="text-[10px] opacity-60 block font-normal -mt-0.5">
                      Merchant Hub Back-Office
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* ============================================================== */}
            {/* VIEW A: CUSTOMER - Sign In vs Sign Up                          */}
            {/* ============================================================== */}
            {role === "customer" && (
              <motion.div
                key="customer-panel"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                {/* Customer Sign In vs Sign Up Sub-Tabs */}
                <div
                  className={`grid grid-cols-2 p-1 rounded-xl border ${
                    isDark ? "bg-zinc-950 border-zinc-850" : "bg-zinc-100/80 border-zinc-200/80"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerMode("signin");
                      setCustomerError("");
                    }}
                    className={`py-2 text-xs font-bold rounded-lg transition-all ${
                      customerMode === "signin"
                        ? isDark
                          ? "bg-zinc-800 text-white shadow-xs"
                          : "bg-white text-zinc-950 shadow-xs"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
                    }`}
                    id="customer-signin-tab"
                  >
                    Customer Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerMode("signup");
                      setCustomerError("");
                    }}
                    className={`py-2 text-xs font-bold rounded-lg transition-all ${
                      customerMode === "signup"
                        ? isDark
                          ? "bg-zinc-800 text-white shadow-xs"
                          : "bg-white text-zinc-950 shadow-xs"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
                    }`}
                    id="customer-signup-tab"
                  >
                    Customer Sign Up
                  </button>
                </div>

                {/* Database Loading State */}
                {isCheckingDb && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-center gap-2 font-medium"
                  >
                    <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-amber-400" />
                    <span>Accessing Firestore Database...</span>
                  </motion.div>
                )}

                {/* Error Banner */}
                {customerError && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 font-medium"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{customerError}</span>
                  </motion.div>
                )}

                {/* ============================================================== */}
                {/* 1. CUSTOMER SIGN IN FORM (Username + Password)                 */}
                {/* ============================================================== */}
                {customerMode === "signin" ? (
                  <form onSubmit={handleCustomerLoginSubmit} className="space-y-4">
                    <div>
                      <label
                        className={`block text-[10px] font-mono uppercase font-bold mb-1.5 ${
                          isDark ? "text-zinc-400" : "text-zinc-600"
                        }`}
                      >
                        Username *
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                        <input
                          type="text"
                          required
                          placeholder="Enter your name, email ID, or phone number"
                          value={customerLoginUsername}
                          onChange={(e) => setCustomerLoginUsername(e.target.value)}
                          className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-xs outline-none transition-all ${
                            isDark
                              ? "bg-zinc-950 border-zinc-800 text-white focus:border-emerald-500"
                              : "bg-white border-zinc-300 text-zinc-900 focus:border-zinc-950"
                          }`}
                          id="customer-login-username-input"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        className={`block text-[10px] font-mono uppercase font-bold mb-1.5 ${
                          isDark ? "text-zinc-400" : "text-zinc-600"
                        }`}
                      >
                        Password *
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                        <input
                          type={showCustomerLoginPassword ? "text" : "password"}
                          required
                          placeholder="Enter your password"
                          value={customerLoginPassword}
                          onChange={(e) => setCustomerLoginPassword(e.target.value)}
                          className={`w-full pl-9 pr-10 py-2.5 rounded-xl border text-xs outline-none transition-all ${
                            isDark
                              ? "bg-zinc-950 border-zinc-800 text-white focus:border-emerald-500"
                              : "bg-white border-zinc-300 text-zinc-900 focus:border-zinc-950"
                          }`}
                          id="customer-login-password-input"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCustomerLoginPassword(!showCustomerLoginPassword)}
                          className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-200"
                          aria-label={showCustomerLoginPassword ? "Hide password" : "Show password"}
                        >
                          {showCustomerLoginPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isCheckingDb}
                      className={`w-full py-3.5 px-4 rounded-2xl font-display font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-98 cursor-pointer disabled:opacity-60 ${
                        isDark
                          ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black shadow-emerald-500/20"
                          : "bg-zinc-950 hover:bg-zinc-800 text-white shadow-zinc-950/20"
                      }`}
                      id="submit-customer-signin-btn"
                    >
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <p className="text-center text-xs text-zinc-500 pt-1">
                      Don&apos;t have an account?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerMode("signup");
                          setCustomerError("");
                        }}
                        className="text-emerald-500 font-bold hover:underline"
                      >
                        Sign up
                      </button>
                    </p>
                  </form>
                ) : (
                  /* ============================================================== */
                  /* 2. CUSTOMER SIGN UP FORM (Name, Phone, Email, Password)        */
                  /* ============================================================== */
                  <form onSubmit={handleCustomerSignupSubmit} className="space-y-3.5">
                    <div>
                      <label
                        className={`block text-[10px] font-mono uppercase font-bold mb-1 ${
                          isDark ? "text-zinc-400" : "text-zinc-600"
                        }`}
                      >
                        Name (Username) *
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
                        <input
                          type="text"
                          required
                          placeholder="Enter your name"
                          value={signupName}
                          onChange={(e) => setSignupName(e.target.value)}
                          className={`w-full pl-9 pr-4 py-2 rounded-xl border text-xs outline-none transition-all ${
                            isDark
                              ? "bg-zinc-950 border-zinc-800 text-white focus:border-emerald-500"
                              : "bg-white border-zinc-300 text-zinc-900 focus:border-zinc-950"
                          }`}
                          id="customer-signup-name-input"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          className={`block text-[10px] font-mono uppercase font-bold mb-1 ${
                            isDark ? "text-zinc-400" : "text-zinc-600"
                          }`}
                        >
                          Phone Number *
                        </label>
                        <div className="relative">
                          <Phone className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
                          <input
                            type="tel"
                            required
                            placeholder="+91 98765 43210"
                            value={signupPhone}
                            onChange={(e) => setSignupPhone(e.target.value)}
                            className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs outline-none transition-all font-mono ${
                              isDark
                                ? "bg-zinc-950 border-zinc-800 text-white focus:border-emerald-500"
                                : "bg-white border-zinc-300 text-zinc-900 focus:border-zinc-950"
                            }`}
                            id="customer-signup-phone-input"
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          className={`block text-[10px] font-mono uppercase font-bold mb-1 ${
                            isDark ? "text-zinc-400" : "text-zinc-600"
                          }`}
                        >
                          Email ID *
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
                          <input
                            type="email"
                            required
                            placeholder="you@example.com"
                            value={signupEmail}
                            onChange={(e) => setSignupEmail(e.target.value)}
                            className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs outline-none transition-all ${
                              isDark
                                ? "bg-zinc-950 border-zinc-800 text-white focus:border-emerald-500"
                                : "bg-white border-zinc-300 text-zinc-900 focus:border-zinc-950"
                            }`}
                            id="customer-signup-email-input"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label
                        className={`block text-[10px] font-mono uppercase font-bold mb-1 ${
                          isDark ? "text-zinc-400" : "text-zinc-600"
                        }`}
                      >
                        Password *
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
                        <input
                          type={showSignupPassword ? "text" : "password"}
                          required
                          placeholder="Create a password (min. 4 characters)"
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          className={`w-full pl-9 pr-10 py-2 rounded-xl border text-xs outline-none transition-all ${
                            isDark
                              ? "bg-zinc-950 border-zinc-800 text-white focus:border-emerald-500"
                              : "bg-white border-zinc-300 text-zinc-900 focus:border-zinc-950"
                          }`}
                          id="customer-signup-password-input"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSignupPassword(!showSignupPassword)}
                          className="absolute right-3 top-2 text-zinc-400 hover:text-zinc-200"
                          aria-label={showSignupPassword ? "Hide password" : "Show password"}
                        >
                          {showSignupPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Avatar Picker */}
                    <div>
                      <label
                        className={`block text-[10px] font-mono uppercase font-bold mb-1.5 ${
                          isDark ? "text-zinc-400" : "text-zinc-600"
                        }`}
                      >
                        Choose Avatar
                      </label>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {AVATAR_PRESETS.map((url, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSelectedAvatar(url)}
                            className={`relative w-8 h-8 rounded-full overflow-hidden shrink-0 transition-all border-2 ${
                              selectedAvatar === url
                                ? "border-emerald-500 scale-105 shadow-sm shadow-emerald-500/30"
                                : "border-transparent opacity-60 hover:opacity-100"
                            }`}
                          >
                            <img
                              src={url}
                              alt={`Preset ${i + 1}`}
                              className="w-full h-full object-cover"
                            />
                            {selectedAvatar === url && (
                              <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isCheckingDb}
                      className={`w-full py-3.5 px-4 rounded-2xl font-display font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-98 cursor-pointer disabled:opacity-60 ${
                        isDark
                          ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black shadow-emerald-500/20"
                          : "bg-zinc-950 hover:bg-zinc-800 text-white"
                      }`}
                      id="submit-customer-signup-btn"
                    >
                      <span>Create Account</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <p className="text-center text-xs text-zinc-500 pt-1">
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerMode("signin");
                          setCustomerError("");
                        }}
                        className="text-emerald-500 font-bold hover:underline"
                      >
                        Sign in
                      </button>
                    </p>
                  </form>
                )}
              </motion.div>
            )}

            {/* ============================================================== */}
            {/* VIEW B: ADMIN - Admin Login (UNCHANGED)                        */}
            {/* ============================================================== */}
            {role === "admin" && (
              <motion.div
                key="admin-panel"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                {adminError && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 font-medium"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{adminError}</span>
                  </motion.div>
                )}

                <form onSubmit={handleAdminLoginSubmit} className="space-y-4">
                  <div>
                    <label
                      className={`block text-[10px] font-mono uppercase font-bold mb-1.5 ${
                        isDark ? "text-zinc-400" : "text-zinc-600"
                      }`}
                    >
                      Admin Username *
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                      <input
                        type="text"
                        required
                        placeholder="Enter admin username"
                        value={adminUsername}
                        onChange={(e) => {
                          setAdminUsername(e.target.value);
                          setAdminError("");
                        }}
                        className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-xs outline-none transition-all ${
                          isDark
                            ? "bg-zinc-950 border-zinc-800 text-white focus:border-amber-400"
                            : "bg-white border-zinc-300 text-zinc-900 focus:border-zinc-950"
                        }`}
                        id="admin-login-username-input"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      className={`block text-[10px] font-mono uppercase font-bold mb-1.5 ${
                        isDark ? "text-zinc-400" : "text-zinc-600"
                      }`}
                    >
                      Admin Password *
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                      <input
                        type={showAdminPassword ? "text" : "password"}
                        required
                        placeholder="Enter admin password"
                        value={adminPassword}
                        onChange={(e) => {
                          setAdminPassword(e.target.value);
                          setAdminError("");
                        }}
                        className={`w-full pl-9 pr-10 py-2.5 rounded-xl border text-xs outline-none transition-all font-mono ${
                          isDark
                            ? "bg-zinc-950 border-zinc-800 text-white focus:border-amber-400"
                            : "bg-white border-zinc-300 text-zinc-900 focus:border-zinc-950"
                        }`}
                        id="admin-login-password-input"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminPassword(!showAdminPassword)}
                        className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-200"
                      >
                        {showAdminPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isAdminLoading}
                    className="w-full py-3.5 px-4 rounded-2xl font-display font-black text-xs flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 shadow-lg shadow-amber-500/20 transition-all active:scale-98 cursor-pointer disabled:opacity-50"
                    id="submit-admin-login-btn"
                  >
                    {isAdminLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                        Authenticating Merchant...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4" />
                        Sign In to Merchant Hub
                      </span>
                    )}
                  </button>

                  <p className="text-center text-xs text-zinc-500 pt-1">
                    Not an administrator?{" "}
                    <button
                      type="button"
                      onClick={() => setRole("customer")}
                      className="text-amber-400 font-bold hover:underline"
                    >
                      Switch to Customer Login
                    </button>
                  </p>
                </form>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
