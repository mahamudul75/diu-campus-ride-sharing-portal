import React from 'react';
import { Link } from 'react-router-dom';
import { Compass, Home, Search } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16 bg-[#E8ECF4] dark:bg-[#111827]">
      <div className="max-w-md w-full text-center space-y-6 bg-[#F5F7FC] dark:bg-[#1C2A40] p-8 sm:p-10 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xl">
        <div className="w-14 h-14 bg-[#DDE2FA]/70 dark:bg-[#24334B] text-[#515FC5] dark:text-[#818CF8] rounded-2xl flex items-center justify-center mx-auto border border-[#515FC5]/20 dark:border-[#818CF8]/30">
          <Compass className="w-7 h-7" />
        </div>

        <div className="space-y-1.5">
          <span className="text-4xl font-black text-[#222B42] dark:text-[#F1F4FC] tracking-tight font-mono">
            404
          </span>
          <h1 className="text-base font-bold text-[#222B42] dark:text-[#F1F4FC]">Page Not Found</h1>
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
            The route you requested does not exist or has been moved.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            to="/"
            className="w-full sm:w-auto px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2"
          >
            <Home className="w-3.5 h-3.5" /> Return Home
          </Link>
          <Link
            to="/search"
            className="w-full sm:w-auto px-4 py-2 border border-[#D4DAE7] dark:border-[#34445E] text-[#222B42] dark:text-[#F1F4FC] hover:bg-[#E8ECF4] dark:hover:bg-[#24334B] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
          >
            <Search className="w-3.5 h-3.5" /> Find Rides
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
