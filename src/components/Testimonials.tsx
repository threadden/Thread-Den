import React, { useState } from "react";
import {
  Star,
  Quote,
  ShieldCheck,
  User,
  CheckCircle2,
  MapPin,
  Calendar,
  Tag,
  X,
  MessageSquarePlus,
} from "lucide-react";
import { CustomerReview, UserProfile, Product } from "../types";
import { normalizePhone } from "../firebase";

interface TestimonialsProps {
  theme: "dark" | "light";
  reviews: CustomerReview[];
  users: UserProfile[];
  products?: Product[];
  onSelectProduct?: (product: Product) => void;
}

function resolveReviewerProfile(
  review: CustomerReview,
  users: UserProfile[]
): UserProfile | null {
  if (!users || users.length === 0) return null;

  if (review.matchedUserId) {
    const byId = users.find((u) => u.id === review.matchedUserId);
    if (byId) return byId;
  }

  const email = review.reviewerEmail?.trim().toLowerCase();
  if (email) {
    const byEmail = users.find(
      (u) => u.email && u.email.trim().toLowerCase() === email
    );
    if (byEmail) return byEmail;
  }

  const cleanPhone = review.reviewerPhone
    ? normalizePhone(review.reviewerPhone)
    : "";
  if (cleanPhone.length >= 7) {
    const suffix = cleanPhone.slice(-10);
    const byPhone = users.find(
      (u) => u.phone && normalizePhone(u.phone).endsWith(suffix)
    );
    if (byPhone) return byPhone;
  }

  const cleanName = review.reviewerName.trim().toLowerCase();
  if (cleanName) {
    const byName = users.find(
      (u) => u.name && u.name.trim().toLowerCase() === cleanName
    );
    if (byName) return byName;
  }

  return null;
}

export default function Testimonials({
  theme,
  reviews,
  users,
  products = [],
  onSelectProduct,
}: TestimonialsProps) {
  const isDark = theme === "dark";
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);

  const avgRating =
    reviews.length > 0
      ? (
          reviews.reduce((sum, r) => sum + (Number(r.rating) || 5), 0) /
          reviews.length
        ).toFixed(1)
      : null;

  const selectedProfileReviews = selectedProfile
    ? reviews.filter((r) => resolveReviewerProfile(r, users)?.id === selectedProfile.id)
    : [];

  return (
    <section
      className={`border-y py-16 sm:py-24 transition-colors duration-300 ${
        isDark ? "bg-zinc-950 border-zinc-900" : "bg-white border-zinc-200/80"
      }`}
      id="testimonials-section"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-12">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div
            className={`inline-flex items-center gap-1.5 border px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${
              isDark
                ? "bg-zinc-900 border-zinc-850 text-zinc-400"
                : "bg-zinc-50 border-zinc-200 text-zinc-600"
            }`}
          >
            <ShieldCheck
              className={`w-3.5 h-3.5 ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
            />
            Customer Reviews
          </div>
          <h2
            className={`font-display font-black text-2xl sm:text-4xl tracking-tight ${
              isDark ? "text-white" : "text-zinc-900"
            }`}
          >
            Community Feedback
          </h2>
          <p
            className={`text-xs sm:text-sm leading-relaxed ${
              isDark ? "text-zinc-400" : "text-zinc-500"
            }`}
          >
            Verified feedback added by our store team. Registered shoppers display their live member profile alongside their review.
          </p>
        </div>

        {/* Empty State vs Published Reviews Grid */}
        {reviews.length === 0 ? (
          <div
            className={`max-w-xl mx-auto border border-dashed rounded-3xl p-10 text-center space-y-3 ${
              isDark
                ? "bg-zinc-900/30 border-zinc-800 text-zinc-400"
                : "bg-zinc-50 border-zinc-200 text-zinc-500"
            }`}
            id="reviews-empty-state"
          >
            <div
              className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center border ${
                isDark
                  ? "bg-zinc-900 border-zinc-800 text-zinc-500"
                  : "bg-white border-zinc-200 text-zinc-400"
              }`}
            >
              <MessageSquarePlus className="w-5 h-5" />
            </div>
            <h3
              className={`font-display font-bold text-base ${
                isDark ? "text-zinc-200" : "text-zinc-800"
              }`}
            >
              No customer reviews added yet
            </h3>
            <p className="text-xs leading-relaxed">
              Customer reviews published manually from the Merchant Hub will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-2">
            {reviews.map((item) => {
              const matchedProfile = resolveReviewerProfile(item, users);
              const displayName = matchedProfile?.name || item.reviewerName;
              const displayAvatar = matchedProfile?.avatarUrl || item.reviewerAvatar;
              const linkedProduct = item.productId
                ? products.find((p) => p.id === item.productId)
                : undefined;
              const starCount = Math.min(5, Math.max(1, Math.round(item.rating || 5)));

              return (
                <div
                  key={item.id}
                  className={`border rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-200 hover:shadow-2xs relative group ${
                    isDark
                      ? "bg-zinc-900/40 hover:bg-zinc-900 border-zinc-800/80 hover:shadow-zinc-950/20"
                      : "bg-zinc-50/60 hover:bg-zinc-50 border-zinc-200/80"
                  }`}
                  id={`testimonial-card-${item.id}`}
                >
                  <Quote
                    className={`absolute right-6 top-6 w-10 h-10 transition-colors pointer-events-none ${
                      isDark
                        ? "text-zinc-800/30 group-hover:text-zinc-800/50"
                        : "text-zinc-200/50 group-hover:text-zinc-200/80"
                    }`}
                  />

                  <div className="space-y-4">
                    {/* Rating & Highlight */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex gap-0.5 text-amber-500">
                          {[...Array(starCount)].map((_, i) => (
                            <Star key={i} className="w-4 h-4 fill-amber-500" />
                          ))}
                        </div>
                        {matchedProfile && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Member Profile
                          </span>
                        )}
                      </div>
                      <p
                        className={`font-display font-extrabold text-sm tracking-tight ${
                          isDark ? "text-zinc-100" : "text-zinc-900"
                        }`}
                      >
                        &ldquo;{item.highlight}&rdquo;
                      </p>
                    </div>

                    {/* Review Text Body */}
                    <p
                      className={`text-xs sm:text-[13px] leading-relaxed ${
                        isDark ? "text-zinc-300" : "text-zinc-600"
                      }`}
                    >
                      {item.content}
                    </p>

                    {/* Optional Reviewed Article Tag */}
                    {(linkedProduct || item.productName) && (
                      <div>
                        <button
                          type="button"
                          disabled={!linkedProduct || !onSelectProduct}
                          onClick={() => {
                            if (linkedProduct && onSelectProduct) {
                              onSelectProduct(linkedProduct);
                            }
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-all ${
                            linkedProduct && onSelectProduct
                              ? isDark
                                ? "bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-400 cursor-pointer"
                                : "bg-white border-zinc-200 text-zinc-700 hover:border-zinc-900 cursor-pointer"
                              : isDark
                              ? "bg-zinc-950 border-zinc-800 text-zinc-400"
                              : "bg-white border-zinc-200 text-zinc-600"
                          }`}
                        >
                          <Tag className="w-3 h-3 text-amber-400" />
                          <span>{linkedProduct?.name || item.productName}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Reviewer / Customer Profile Footer */}
                  <div
                    className={`mt-8 pt-6 border-t space-y-3 ${
                      isDark ? "border-zinc-800/60" : "border-zinc-200/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="relative shrink-0">
                          {displayAvatar ? (
                            <img
                              src={displayAvatar}
                              alt={displayName}
                              className={`w-11 h-11 rounded-full object-cover border-2 ring-1 shadow-3xs ${
                                isDark
                                  ? "border-zinc-800 ring-zinc-900"
                                  : "border-white ring-zinc-200"
                              }`}
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div
                              className={`w-11 h-11 rounded-full flex items-center justify-center border-2 font-display font-bold text-sm ${
                                isDark
                                  ? "bg-zinc-800 border-zinc-700 text-zinc-200"
                                  : "bg-zinc-200 border-white text-zinc-700"
                              }`}
                            >
                              {displayName.charAt(0).toUpperCase() || <User className="w-4 h-4" />}
                            </div>
                          )}
                          {matchedProfile && (
                            <span
                              className={`absolute -bottom-1 -right-1 rounded-full p-0.5 border-2 ${
                                isDark
                                  ? "bg-emerald-500 border-zinc-900 text-zinc-950"
                                  : "bg-emerald-600 border-white text-white"
                              }`}
                              title="Registered Customer Profile"
                            >
                              <ShieldCheck className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <h4
                            className={`font-display font-bold text-xs flex items-center gap-1.5 truncate ${
                              isDark ? "text-white" : "text-zinc-950"
                            }`}
                          >
                            {displayName}
                          </h4>
                          <p className="text-[10px] font-mono text-zinc-400 mt-0.5 font-medium truncate">
                            {matchedProfile
                              ? `Member since ${matchedProfile.createdAt}`
                              : item.roleOrCompany || "Customer Review"}
                          </p>
                        </div>
                      </div>

                      {matchedProfile && (
                        <button
                          type="button"
                          onClick={() => setSelectedProfile(matchedProfile)}
                          className={`px-2.5 py-1.5 rounded-xl text-[10px] font-mono font-bold border transition-all shrink-0 cursor-pointer ${
                            isDark
                              ? "bg-zinc-950 border-zinc-800 text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/10"
                              : "bg-white border-zinc-200 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50"
                          }`}
                          id={`view-reviewer-profile-btn-${item.id}`}
                        >
                          View Profile
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Live Review Summary Bar (shown only when real reviews exist) */}
        {reviews.length > 0 && (
          <div
            className={`pt-8 border-t flex flex-wrap justify-center items-center gap-x-12 gap-y-6 text-center ${
              isDark ? "border-zinc-900" : "border-zinc-100"
            }`}
          >
            <div className="space-y-1">
              <span
                className={`font-mono text-xl sm:text-2xl font-black ${
                  isDark ? "text-white" : "text-zinc-900"
                }`}
              >
                {avgRating} ★
              </span>
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                Average Rating
              </p>
            </div>
            <div
              className={`h-6 w-px hidden sm:block ${
                isDark ? "bg-zinc-850" : "bg-zinc-200"
              }`}
            />
            <div className="space-y-1">
              <span
                className={`font-mono text-xl sm:text-2xl font-black ${
                  isDark ? "text-white" : "text-zinc-900"
                }`}
              >
                {reviews.length}
              </span>
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                Published {reviews.length === 1 ? "Review" : "Reviews"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Customer Profile Modal (Displays Registered Reviewer Profile) */}
      {selectedProfile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setSelectedProfile(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl space-y-5 relative ${
              isDark
                ? "bg-zinc-900 border-zinc-800 text-zinc-100"
                : "bg-white border-zinc-200 text-zinc-900"
            }`}
            id="reviewer-profile-modal"
          >
            <button
              type="button"
              onClick={() => setSelectedProfile(null)}
              className={`absolute top-4 right-4 p-2 rounded-xl transition-colors cursor-pointer ${
                isDark
                  ? "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
              }`}
              aria-label="Close profile"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-4">
              {selectedProfile.avatarUrl ? (
                <img
                  src={selectedProfile.avatarUrl}
                  alt={selectedProfile.name}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-500 shadow-md shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-display font-black text-xl shrink-0">
                  {selectedProfile.name.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display font-bold text-lg truncate">
                    {selectedProfile.name}
                  </h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <ShieldCheck className="w-3 h-3" />
                    Registered Profile
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-zinc-400">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-emerald-400" />
                    Joined {selectedProfile.createdAt}
                  </span>
                  {selectedProfile.savedAddresses &&
                    selectedProfile.savedAddresses.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-amber-400" />
                        {selectedProfile.savedAddresses[0].city}
                        {selectedProfile.savedAddresses[0].state
                          ? `, ${selectedProfile.savedAddresses[0].state}`
                          : ""}
                      </span>
                    )}
                </div>
              </div>
            </div>

            <div
              className={`p-3 rounded-2xl border text-xs flex items-center gap-2 ${
                isDark
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800"
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Registered customer account.</span>
            </div>

            <div className="space-y-2.5">
              <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-400">
                Reviews by {selectedProfile.name} ({selectedProfileReviews.length})
              </h4>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {selectedProfileReviews.map((rev) => (
                  <div
                    key={rev.id}
                    className={`p-3.5 rounded-2xl border space-y-1.5 ${
                      isDark
                        ? "bg-zinc-950 border-zinc-800"
                        : "bg-zinc-50 border-zinc-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-0.5 text-amber-500">
                        {[...Array(Math.min(5, Math.max(1, rev.rating)))].map((_, i) => (
                          <Star key={i} className="w-3 h-3 fill-amber-500" />
                        ))}
                      </div>
                      {rev.productName && (
                        <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[180px]">
                          {rev.productName}
                        </span>
                      )}
                    </div>
                    <p className="font-display font-bold text-xs">{rev.highlight}</p>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      {rev.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
