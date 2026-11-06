import React from 'react';
import { Link } from 'react-router-dom';
import { Car, ShieldCheck, MapPin, Phone, Mail, Heart } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-950 text-slate-400 border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          {/* Brand/About */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
                <Car className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white tracking-tight">CampusRide</span>
            </div>
            <p className="text-sm text-slate-500">
              Student-only carpooling and bike-pooling network for Daffodil International University.
            </p>
            <div className="flex items-center gap-2 text-sm text-emerald-500 font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>Verified Students Only</span>
            </div>
          </div>

          {/* Navigation */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-white tracking-widest uppercase">NAVIGATION</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/search" className="hover:text-white transition-colors">Find a Ride</Link></li>
              <li><Link to="/become-driver" className="hover:text-white transition-colors">Offer a Ride</Link></li>
              <li><Link to="/dashboard" className="hover:text-white transition-colors">Dashboard</Link></li>
              <li><Link to="/login" className="hover:text-white transition-colors">Sign In</Link></li>
            </ul>
          </div>

          {/* Key Routes */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-white tracking-widest uppercase">KEY ROUTES</h4>
            <ul className="space-y-2 text-sm text-slate-500 list-disc list-inside">
              <li>Ashulia ⇄ Dhanmondi</li>
              <li>Ashulia ⇄ Mirpur 10</li>
              <li>Ashulia ⇄ Uttara</li>
              <li>Ashulia ⇄ Savar Stand</li>
            </ul>
          </div>

          {/* Campus Contacts */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-white tracking-widest uppercase">CAMPUS CONTACTS</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li className="flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-600" /> Smart City, Savar</li>
              <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-600" /> Security: 01847140000</li>
              <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-600" /> Ambulance: 01847140020</li>
              <li className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-600" /> support@diu.edu.bd</li>
            </ul>
          </div>
        </div>

        {/* Divider & Bottom Bar */}
        <div className="mt-16 pt-8 border-t border-slate-900 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <p>© 2026 Daffodil International University. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            Built for DIU Community <Heart className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
