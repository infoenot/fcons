import React, { useState } from 'react';
import Header from './components/Layout/Header';
import BottomNav from './components/Layout/BottomNav';
import ChatScreen from './components/Screens/ChatScreen';
import CalendarScreen from './components/Screens/CalendarScreen';
import AccountScreen from './components/Screens/AccountScreen';
import AnalyticsScreen from './components/Screens/AnalyticsScreen';
import TransactionModal from './components/Modals/TransactionModal';
import { FinanceProvider } from './context/FinanceContext';
import { ChatProvider } from './context/ChatContext';
import { ThemeProvider } from './context/ThemeContext';

export default function App() {
  const [activeTab, setActiveTab] = useState('chat');
  
  const renderScreen = () => {
    switch (activeTab) {
      case 'chat': return <ChatScreen />;
      case 'calendar': return <CalendarScreen />;
      case 'analytics': return <AnalyticsScreen />;
      case 'account': return <AccountScreen />;
      default: return <ChatScreen />;
    }
  };

  return (
    <ThemeProvider>
      <FinanceProvider>
        <ChatProvider>
          {/* Main container: Full viewport height, no scroll on body */}
          <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-fin-bg text-fin-text shadow-elevation-lg overflow-hidden relative transition-colors duration-300">
            
            {/* Header */}
            <Header />
            
            {/* Main Content */}
            <main className="flex-1 overflow-hidden relative z-10 bg-fin-bg flex flex-col min-h-0 transition-colors duration-300">
              {renderScreen()}
            </main>

            {/* BottomNav */}
            <BottomNav currentTab={activeTab} onTabChange={setActiveTab} />
            
            {/* Global Modal */}
            <TransactionModal />
          </div>
        </ChatProvider>
      </FinanceProvider>
    </ThemeProvider>
  );
}
