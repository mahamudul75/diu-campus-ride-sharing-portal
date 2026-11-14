import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.tsx';

interface ThemeToggleProps {
  className?: string;
  showDropdown?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = '',
  showDropdown = false
}) => {
  const { theme, isDark, setTheme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!showDropdown) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`p-2 rounded-xl text-[#626E86] hover:text-[#222B42] dark:text-[#B0BCD0] dark:hover:text-[#F1F4FC] hover:bg-[#E1E6F0] dark:hover:bg-[#24334B] border border-[#D4DAE7]/50 dark:border-[#34445E]/50 transition-colors cursor-pointer ${className}`}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Light mode' : 'Dark mode'}
      >
        {isDark ? (
          <Sun className="w-4 h-4 text-[#818CF8]" />
        ) : (
          <Moon className="w-4 h-4 text-[#515FC5]" />
        )}
      </button>
    );
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-2 rounded-xl text-[#626E86] hover:text-[#222B42] dark:text-[#B0BCD0] dark:hover:text-[#F1F4FC] hover:bg-[#E1E6F0] dark:hover:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
        aria-label="Theme selector"
        title="Theme options"
      >
        {theme === 'dark' ? (
          <Moon className="w-4 h-4 text-[#818CF8]" />
        ) : theme === 'light' ? (
          <Sun className="w-4 h-4 text-[#515FC5]" />
        ) : (
          <Laptop className="w-4 h-4 text-[#626E86] dark:text-[#B0BCD0]" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-36 bg-[#FFFFFF] dark:bg-[#24334B] rounded-2xl shadow-xl border border-[#D4DAE7] dark:border-[#34445E] py-1.5 z-50 animate-scale-up text-xs">
          <button
            type="button"
            onClick={() => {
              setTheme('light');
              setOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left transition-colors cursor-pointer ${
              theme === 'light'
                ? 'text-[#515FC5] dark:text-[#818CF8] font-bold bg-[#DDE2FA] dark:bg-[#818CF8]/20'
                : 'text-[#222B42] dark:text-[#F1F4FC] hover:bg-[#E1E6F0] dark:hover:bg-[#1C2A40]'
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
            <span>Light</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTheme('dark');
              setOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left transition-colors cursor-pointer ${
              theme === 'dark'
                ? 'text-[#515FC5] dark:text-[#818CF8] font-bold bg-[#DDE2FA] dark:bg-[#818CF8]/20'
                : 'text-[#222B42] dark:text-[#F1F4FC] hover:bg-[#E1E6F0] dark:hover:bg-[#1C2A40]'
            }`}
          >
            <Moon className="w-3.5 h-3.5 text-[#818CF8]" />
            <span>Deep Dark</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTheme('system');
              setOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left transition-colors cursor-pointer ${
              theme === 'system'
                ? 'text-[#515FC5] dark:text-[#818CF8] font-bold bg-[#DDE2FA] dark:bg-[#818CF8]/20'
                : 'text-[#222B42] dark:text-[#F1F4FC] hover:bg-[#E1E6F0] dark:hover:bg-[#1C2A40]'
            }`}
          >
            <Laptop className="w-3.5 h-3.5 text-[#626E86] dark:text-[#B0BCD0]" />
            <span>System</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ThemeToggle;
