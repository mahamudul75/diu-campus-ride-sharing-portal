import React from 'react';
import { Link } from 'react-router-dom';
import { Car, ShieldCheck, MapPin, Phone, Mail, Heart } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#FFFFFF] dark:bg-[#151F32] text-[#66738A] dark:text-[#B4C0D3] border-t border-[#DCE2EC] dark:border-[#34445D] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-10">
          {/* 1. DIU Ride Branding */}
          <div className="space-y-4">
            <Link to="/" className="inline-flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-[#4F5FC9] dark:bg-[#818CF8] flex items-center justify-center text-white dark:text-[#111827] shadow-md shadow-[#4F5FC9]/20 group-hover:scale-105 transition-transform">
                <Car className="w-5 h-5" />
              </div>
              <span className="text-lg font-black text-[#253149] dark:text-[#F1F5FC] tracking-tight whitespace-nowrap">
                DIU <span className="text-[#4F5FC9] dark:text-[#818CF8]">Ride</span>
              </span>
            </Link>
            <p className="text-xs text-[#66738A] dark:text-[#B4C0D3] leading-relaxed max-w-xs">
              Official private ride-sharing and carpooling platform exclusively for Daffodil International University students.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#EEF0FA] dark:bg-[#818CF8]/15 border border-[#4F5FC9]/20 dark:border-[#818CF8]/30 text-[#4F5FC9] dark:text-[#818CF8] text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Verified DIU ID Required</span>
            </div>
          </div>

          {/* 2. Quick Navigation */}
          <div className="space-y-4">
            <h4 className="text-[11px] font-bold text-[#253149] dark:text-[#F1F5FC] tracking-wider uppercase">
              Quick Navigation
            </h4>
            <ul className="space-y-2.5 text-xs font-medium">
              <li>
                <Link
                  to="/search"
                  className="inline-block hover:text-[#4F5FC9] dark:hover:text-[#818CF8] transition-colors"
                >
                  Find a Ride
                </Link>
              </li>
              <li>
                <Link
                  to="/rides/create"
                  className="inline-block hover:text-[#4F5FC9] dark:hover:text-[#818CF8] transition-colors"
                >
                  Offer a Ride
                </Link>
              </li>
              <li>
                <Link
                  to="/become-driver"
                  className="inline-block hover:text-[#4F5FC9] dark:hover:text-[#818CF8] transition-colors"
                >
                  Driver Application
                </Link>
              </li>
              <li>
                <Link
                  to="/dashboard"
                  className="inline-block hover:text-[#4F5FC9] dark:hover:text-[#818CF8] transition-colors"
                >
                  Student Dashboard
                </Link>
              </li>
              <li>
                <Link
                  to="/safety"
                  className="inline-block hover:text-[#4F5FC9] dark:hover:text-[#818CF8] transition-colors"
                >
                  Campus Safety Center
                </Link>
              </li>
            </ul>
          </div>

          {/* 3. Key Campus Corridors */}
          <div className="space-y-4">
            <h4 className="text-[11px] font-bold text-[#253149] dark:text-[#F1F5FC] tracking-wider uppercase">
              Key Campus Corridors
            </h4>
            <div className="space-y-3 text-xs text-[#66738A] dark:text-[#B4C0D3]">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8] shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <p className="font-semibold text-[#253149] dark:text-[#F1F5FC]">
                    Daffodil Smart City
                  </p>
                  <p className="text-[11px] text-[#66738A]/90 dark:text-[#94A3B8] mt-0.5">
                    Birulia, Savar, Dhaka
                  </p>
                </div>
              </div>
              <ul className="space-y-2">
                {[
                  'Dhanmondi',
                  'Mirpur 1',
                  'Mirpur 10',
                  'Uttara',
                ].map((area) => (
                  <li key={area} className="flex items-start gap-2 leading-snug">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4F5FC9] dark:bg-[#818CF8] mt-1.5 shrink-0" />
                    <span>
                      Daffodil Smart City{' '}
                      <span
                        aria-hidden="true"
                        className="text-[#4F5FC9] dark:text-[#818CF8] font-medium"
                      >
                        ↔
                      </span>{' '}
                      {area}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 4. Emergency Contacts */}
          <div className="space-y-4">
            <h4 className="text-[11px] font-bold text-[#253149] dark:text-[#F1F5FC] tracking-wider uppercase">
              Emergency Contacts
            </h4>
            <ul className="space-y-2.5 text-xs text-[#66738A] dark:text-[#B4C0D3]">
              <li className="flex items-start gap-2.5 leading-relaxed">
                <MapPin className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8] shrink-0 mt-0.5" />
                <span>University Campus Hub</span>
              </li>
              <li className="flex items-start gap-2.5 leading-relaxed">
                <Phone className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8] shrink-0 mt-0.5" />
                <a
                  href="tel:01847140000"
                  className="hover:text-[#4F5FC9] dark:hover:text-[#818CF8] transition-colors tabular-nums"
                >
                  Campus Security: 01847140000
                </a>
              </li>
              <li className="flex items-start gap-2.5 leading-relaxed">
                <Phone className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8] shrink-0 mt-0.5" />
                <a
                  href="tel:01847140020"
                  className="hover:text-[#4F5FC9] dark:hover:text-[#818CF8] transition-colors tabular-nums"
                >
                  Medical Emergency: 01847140020
                </a>
              </li>
              <li className="flex items-start gap-2.5 leading-relaxed">
                <Mail className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8] shrink-0 mt-0.5" />
                <a
                  href="mailto:transport@diu.edu.bd"
                  className="hover:text-[#4F5FC9] dark:hover:text-[#818CF8] transition-colors break-all"
                >
                  Email: transport@diu.edu.bd
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* 5. Bottom Footer */}
        <div className="mt-10 pt-6 border-t border-[#DCE2EC] dark:border-[#34445D] flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left text-xs text-[#66738A] dark:text-[#B4C0D3]">
          <p>© 2026 DIU Ride. All rights reserved.</p>
          <p className="inline-flex items-center gap-1.5">
            Designed for DIU Students &amp; Faculty
            <Heart className="w-3.5 h-3.5 text-[#4F5FC9] dark:text-[#818CF8] fill-[#4F5FC9] dark:fill-[#818CF8] shrink-0" />
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
