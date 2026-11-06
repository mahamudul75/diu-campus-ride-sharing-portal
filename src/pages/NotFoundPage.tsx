import React from 'react';
import { Link } from 'react-router-dom';
import { Compass, Home, Search } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center space-y-6 bg-white dark:bg-slate-900 p-8 sm:p-10 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xl">
        <div className="w-14 h-14 bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 rounded-2xl flex items-center justify-center mx-auto border border-teal-100 dark:border-teal-900">
          <Compass className="w-7 h-7" />
        </div>

        <div className="space-y-1.5">
          <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tight font-mono">
            404
          </span>
          <h1 className="text-base font-bold text-slate-900 dark:text-white">Page Not Found</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            The route you requested does not exist or has been moved.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            to="/"
            className="w-full sm:w-auto px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2"
          >
            <Home className="w-3.5 h-3.5" /> Return Home
          </Link>
          <Link
            to="/search"
            className="w-full sm:w-auto px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
          >
            <Search className="w-3.5 h-3.5" /> Find Rides
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
