import { useApp } from "@/contexts";
import { ShieldCheck, CalendarClock, Infinity, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

export const LicenseInfo = () => {
  const { hasActiveLicense, licenseDetails } = useApp();

  if (!hasActiveLicense) {
    return (
      <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5">
        <div className="flex items-center gap-2 text-red-400 text-sm font-medium mb-1">
          <ShieldCheck className="w-4 h-4" />
          No Active License
        </div>
        <p className="text-xs text-zinc-500">
          Activate a license to unlock all features
        </p>
      </div>
    );
  }

  const isLifetime = licenseDetails?.daysLeft === "Lifetime";
  const daysNum = typeof licenseDetails?.daysLeft === "number" ? licenseDetails.daysLeft : 0;
  const isExpiringSoon = !isLifetime && daysNum <= 7 && daysNum > 0;

  return (
    <div className={cn(
      "p-4 rounded-xl border",
      isExpiringSoon
        ? "border-yellow-500/30 bg-yellow-500/5"
        : "border-green-500/20 bg-green-500/5"
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className={cn(
          "flex items-center gap-2 text-sm font-semibold",
          isExpiringSoon ? "text-yellow-400" : "text-green-400"
        )}>
          <Crown className="w-4 h-4" />
          {licenseDetails?.plan || "Pro"} Plan
        </div>
        <span className={cn(
          "text-[10px] font-medium px-2 py-0.5 rounded-full",
          isLifetime
            ? "bg-sh-500/15 text-sh-400"
            : isExpiringSoon
              ? "bg-yellow-500/15 text-yellow-400"
              : "bg-green-500/15 text-green-400"
        )}>
          Active
        </span>
      </div>

      <div className={cn(
        "flex items-center gap-2 text-xs",
        isExpiringSoon ? "text-yellow-300/70" : "text-zinc-400"
      )}>
        {isLifetime ? (
          <>
            <Infinity className="w-3.5 h-3.5 text-sh-500" />
            <span>Lifetime license — never expires</span>
          </>
        ) : (
          <>
            <CalendarClock className="w-3.5 h-3.5" />
            <span>
              {isExpiringSoon && "⚠️ "}
              {daysNum} day{daysNum !== 1 ? "s" : ""} remaining
            </span>
          </>
        )}
      </div>

      {/* Expiry date */}
      {licenseDetails?.expiresAt && (
        <div className="text-[10px] text-zinc-600 mt-1.5 ml-5.5">
          Expires: {new Date(licenseDetails.expiresAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric"
          })}
        </div>
      )}
    </div>
  );
};