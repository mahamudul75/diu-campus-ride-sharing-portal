import React from 'react';
import { Link } from 'react-router-dom';
import { Car, ShieldCheck, MapPin, Phone, Mail, Heart } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#FFFFFF] dark:bg-[#151F32] text-[#66738A] dark:text-[#B4C0D3] border-t border-[#DCE2EC] dark:border-[#34445D] transition-colors">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          
          {/* Brand/About */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#4F5FC9] dark:bg-[#818CF8] flex items-center justify-center text-white dark:text-[#111827] shadow-md shadow-[#4F5FC9]/20">
                <Car className="w-5 h-5" />
              </div>
              <span className="text-lg font-black text-[#253149] dark:text-[#F1F5FC] tracking-tight">
                DIU <span className="text-[#4F5FC9] dark:text-[#818CF8]">Ride</span>
              </span>
            </div>
            <p className="text-xs text-[#66738A] dark:text-[#B4C0D3] leading-relaxed">
              Official private ride-sharing and carpooling platform exclusively for Daffodil International University students.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#EEF0FA] dark:bg-[#818CF8]/15 border border-[#4F5FC9]/20 dark:border-[#818CF8]/30 text-[#4F5FC9] dark:text-[#818CF8] text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Verified DIU ID Required</span>
            </div>
          </div>

          {/* Navigation */}
          <div className="space-y-4">
            <h4 className="text-xs font-black text-[#253149] dark:text-[#F1F5FC] tracking-widest uppercase">Quick Navigation</h4>
            <ul className="space-y-2.5 text-xs font-medium">
              <li><Link to="/search" className="hover:text-[#4F5FC9] dark:hover:text-[#818CF8] transition-colors">Find a Ride</Link></li>
              <li><Link to="/become-driver" className="hover:text-[#4F5FC9] dark:hover:text-[#818CF8] transition-colors">Offer a Ride / Driver Application</Link></li>
              <li><Link to="/dashboard" className="hover:text-[#4F5FC9] dark:hover:text-[#818CF8] transition-colors">Student Dashboard</Link></li>
              <li><Link to="/safety" className="hover:text-[#4F5FC9] dark:hover:text-[#818CF8] transition-colors">Campus Safety Center</Link></li>
            </ul>
          </div>

          {/* Key Campus Corridors */}
          <div className="space-y-4">
            <h4 className="text-xs font-black text-[#253149] dark:text-[#F1F5FC] tracking-widest uppercase">Key Campus Corridors</h4>
            <ul className="space-y-2 text-xs text-[#66738A] dark:text-[#B4C0D3]">
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#4F5FC9] dark:bg-[#818CF8]"></span> Campus ⇄ City Hubs</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#4F5FC9] dark:bg-[#818CF8]"></span> Main Gate ⇄ Metro Stations</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#4F5FC9] dark:bg-[#818CF8]"></span> Residential Zones ⇄ Academic Buildings</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#4F5FC9] dark:bg-[#818CF8]"></span> Inter-Campus Shuttles</li>
            </ul>
          </div>

          {/* Campus Contacts & Emergency */}
          <div className="space-y-4">
            <h4 className="text-xs font-black text-[#253149] dark:text-[#F1F5FC] tracking-widest uppercase">Emergency Contacts</h4>
            <ul className="space-y-2.5 text-xs text-[#66738A] dark:text-[#B4C0D3]">
              <li className="flex items-center gap-2"><MapPin className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8] shrink-0" /> University Campus Hub</li>
              <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8] shrink-0" /> Campus Security: 01847140000</li>
              <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8] shrink-0" /> Medical Emergency: 01847140020</li>
              <li className="flex items-center gap-2"><Mail className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8] shrink-0" /> transport@diu.edu.bd</li>
            </ul>
          </div>
        </div>

        {/* Divider & Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-[#DCE2EC] dark:border-[#34445D] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#66738A] dark:text-[#B4C0D3]">
          <p>© 2026 Daffodil International University. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            Designed for DIU Students & Faculty <Heart className="w-3.5 h-3.5 text-[#4F5FC9] dark:text-[#818CF8] fill-[#4F5FC9] dark:fill-[#818CF8]" />
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
