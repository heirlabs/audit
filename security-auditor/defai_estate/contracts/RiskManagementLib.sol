// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

library RiskManagementLib {
    enum TradingStrategy { Conservative, Balanced, Aggressive }
    
    struct TradingHours {
        uint8 startHour;
        uint8 endHour;
        uint8[] activeDays;
        string timezone;
    }

    struct StrategyMix {
        uint8 spotPercentage;
        uint8 derivativesPercentage;
        uint8 stablecoinPercentage;
        uint8 deFiPercentage;
    }
    
    struct RiskManagementSettings {
        uint256 maxPositionSize;
        uint256 maxDailyLoss;
        uint256 maxDrawdown;
        uint256 maxLeverage;
        uint256 minLiquidity;
        uint256 maxExposurePerAsset;
        uint256 maxTotalExposure;
        uint256 maxVolatilityThreshold;
        uint256 rebalanceFrequency;
        uint256 riskCheckInterval;
        bool allowHighRiskTrades;
        bool autoStopLossEnabled;
        uint256 defaultStopLoss;
        uint256 defaultTakeProfit;
        uint256 maxSlippage;
        uint256 maxGasPrice;
        TradingHours tradingHours;
        StrategyMix strategyMix;
    }

    function getConservativeSettings() internal pure returns (RiskManagementSettings memory) {
        uint8[] memory activeDays = new uint8[](5);
        for (uint i = 0; i < 5; i++) {
            activeDays[i] = uint8(i + 1);
        }
        
        return RiskManagementSettings({
            maxPositionSize: 10000 * 10**18,
            maxDailyLoss: 200 * 10**18,
            maxDrawdown: 500 * 10**18,
            maxLeverage: 2,
            minLiquidity: 5000 * 10**18,
            maxExposurePerAsset: 2000 * 10**18,
            maxTotalExposure: 8000 * 10**18,
            maxVolatilityThreshold: 20,
            rebalanceFrequency: 7 days,
            riskCheckInterval: 1 hours,
            allowHighRiskTrades: false,
            autoStopLossEnabled: true,
            defaultStopLoss: 5,
            defaultTakeProfit: 10,
            maxSlippage: 1,
            maxGasPrice: 100 gwei,
            tradingHours: TradingHours({
                startHour: 9,
                endHour: 17,
                activeDays: activeDays,
                timezone: "UTC"
            }),
            strategyMix: StrategyMix({
                spotPercentage: 70,
                derivativesPercentage: 10,
                stablecoinPercentage: 15,
                deFiPercentage: 5
            })
        });
    }

    function getBalancedSettings() internal pure returns (RiskManagementSettings memory) {
        uint8[] memory activeDays = new uint8[](7);
        for (uint i = 0; i < 7; i++) {
            activeDays[i] = uint8(i + 1);
        }
        
        return RiskManagementSettings({
            maxPositionSize: 25000 * 10**18,
            maxDailyLoss: 1000 * 10**18,
            maxDrawdown: 2000 * 10**18,
            maxLeverage: 5,
            minLiquidity: 2000 * 10**18,
            maxExposurePerAsset: 5000 * 10**18,
            maxTotalExposure: 20000 * 10**18,
            maxVolatilityThreshold: 40,
            rebalanceFrequency: 3 days,
            riskCheckInterval: 30 minutes,
            allowHighRiskTrades: true,
            autoStopLossEnabled: true,
            defaultStopLoss: 10,
            defaultTakeProfit: 20,
            maxSlippage: 2,
            maxGasPrice: 200 gwei,
            tradingHours: TradingHours({
                startHour: 0,
                endHour: 23,
                activeDays: activeDays,
                timezone: "UTC"
            }),
            strategyMix: StrategyMix({
                spotPercentage: 50,
                derivativesPercentage: 25,
                stablecoinPercentage: 15,
                deFiPercentage: 10
            })
        });
    }

    function getAggressiveSettings() internal pure returns (RiskManagementSettings memory) {
        uint8[] memory activeDays = new uint8[](7);
        for (uint i = 0; i < 7; i++) {
            activeDays[i] = uint8(i + 1);
        }
        
        return RiskManagementSettings({
            maxPositionSize: 50000 * 10**18,
            maxDailyLoss: 5000 * 10**18,
            maxDrawdown: 10000 * 10**18,
            maxLeverage: 10,
            minLiquidity: 1000 * 10**18,
            maxExposurePerAsset: 15000 * 10**18,
            maxTotalExposure: 45000 * 10**18,
            maxVolatilityThreshold: 80,
            rebalanceFrequency: 1 days,
            riskCheckInterval: 15 minutes,
            allowHighRiskTrades: true,
            autoStopLossEnabled: false,
            defaultStopLoss: 20,
            defaultTakeProfit: 40,
            maxSlippage: 5,
            maxGasPrice: 500 gwei,
            tradingHours: TradingHours({
                startHour: 0,
                endHour: 23,
                activeDays: activeDays,
                timezone: "UTC"
            }),
            strategyMix: StrategyMix({
                spotPercentage: 30,
                derivativesPercentage: 40,
                stablecoinPercentage: 10,
                deFiPercentage: 20
            })
        });
    }
}