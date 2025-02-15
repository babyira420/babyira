```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

contract BabyIRA is ERC20, Ownable, Pausable {
    // Reward tokens
    IERC20 public rewardToken1;
    IERC20 public rewardToken2;
    IERC20 public rewardToken3;

    // Wallets
    address public burnAddress = 0x000000000000000000000000000000000000dEaD; // Dead address for burning
    address public liquidityWallet;
    address public giveawayWallet;
    address public marketingWallet;
    address public treasuryWallet;
    address public buybackWallet;

    // Buy and sell tax rates (in basis points, e.g., 100 = 1%)
    struct TaxRates {
        uint256 liquidity;
        uint256 giveaway;
        uint256 marketing;
        uint256 treasury;
        uint256 buyback;
        uint256 burn;
    }

    TaxRates public buyTaxRates;
    TaxRates public sellTaxRates;

    // Reward token fee rates (in basis points)
    struct RewardTokenFees {
        uint256 buyFee;
        uint256 sellFee;
    }

    mapping(IERC20 => RewardTokenFees) public rewardTokenFees;

    // Transfer tax rate (in basis points, e.g., 100 = 1%)
    uint256 public constant TRANSFER_TAX_RATE = 200; // 2%

    // Tax distribution rates (in basis points)
    uint256 public constant LIQUIDITY_TAX_RATE = 5000; // 50% of transfer tax (1%)
    uint256 public constant BURN_TAX_RATE = 2500; // 25% of transfer tax (0.5%)
    uint256 public constant TREASURY_TAX_RATE = 2500; // 25% of transfer tax (0.5%)

    // Uniswap
    IUniswapV2Router02 public uniswapRouter;
    address public uniswapPair;

    // Events
    event TaxesUpdated(bool isBuyTax, uint256 liquidity, uint256 giveaway, uint256 marketing, uint256 treasury, uint256 buyback, uint256 burn);
    event RewardTokenFeesUpdated(IERC20 indexed rewardToken, uint256 buyFee, uint256 sellFee);
    event RewardsDistributed(address indexed user, uint256 amount1, uint256 amount2, uint256 amount3);
    event TransferTaxDistributed(uint256 liquidityAmount, uint256 burnAmount, uint256 treasuryAmount);
    event LiquidityAdded(uint256 tokenAmount, uint256 ethAmount);
    event ETHWithdrawn(address indexed owner, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount1, uint256 amount2, uint256 amount3);

    constructor(
        address _rewardToken1,
        address _rewardToken2,
        address _rewardToken3,
        address _liquidityWallet,
        address _giveawayWallet,
        address _marketingWallet,
        address _treasuryWallet,
        address _buybackWallet,
        address _uniswapRouter
    ) ERC20("BABYIRA", "BABYIRA") {
        rewardToken1 = IERC20(_rewardToken1);
        rewardToken2 = IERC20(_rewardToken2);
        rewardToken3 = IERC20(_rewardToken3);

        liquidityWallet = _liquidityWallet;
        giveawayWallet = _giveawayWallet;
        marketingWallet = _marketingWallet;
        treasuryWallet = _treasuryWallet;
        buybackWallet = _buybackWallet;

        // Initialize Uniswap Router and Pair
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        uniswapPair = IUniswapV2Factory(uniswapRouter.factory()).createPair(address(this), uniswapRouter.WETH());

        // Mint initial supply to the deployer (420,000,000 tokens with 18 decimals)
        _mint(msg.sender, 420000000 * 10 ** decimals());
    }

    // Pause the contract
    function pause() external onlyOwner {
        _pause();
    }

    // Unpause the contract
    function unpause() external onlyOwner {
        _unpause();
    }

    // Renounce ownership (make the contract fully decentralized)
    function renounceOwnership() public override onlyOwner {
        super.renounceOwnership();
    }

    // Set buy tax rates
    function setBuyTaxRates(
        uint256 liquidity,
        uint256 giveaway,
        uint256 marketing,
        uint256 treasury,
        uint256 buyback,
        uint256 burn
    ) external onlyOwner {
        require(liquidity + giveaway + marketing + treasury + buyback + burn <= 10000, "Total buy tax cannot exceed 100%");
        buyTaxRates = TaxRates(liquidity, giveaway, marketing, treasury, buyback, burn);
        emit TaxesUpdated(true, liquidity, giveaway, marketing, treasury, buyback, burn);
    }

    // Set sell tax rates
    function setSellTaxRates(
        uint256 liquidity,
        uint256 giveaway,
        uint256 marketing,
        uint256 treasury,
        uint256 buyback,
        uint256 burn
    ) external onlyOwner {
        require(liquidity + giveaway + marketing + treasury + buyback + burn <= 10000, "Total sell tax cannot exceed 100%");
        sellTaxRates = TaxRates(liquidity, giveaway, marketing, treasury, buyback, burn);
        emit TaxesUpdated(false, liquidity, giveaway, marketing, treasury, buyback, burn);
    }

    // Set reward token fees
    function setRewardTokenFees(
        IERC20 rewardToken,
        uint256 buyFee,
        uint256 sellFee
    ) external onlyOwner {
        require(buyFee <= 10000 && sellFee <= 10000, "Fees cannot exceed 100%");
        rewardTokenFees[rewardToken] = RewardTokenFees(buyFee, sellFee);
        emit RewardTokenFeesUpdated(rewardToken, buyFee, sellFee);
    }

    // Override transfer function to apply taxes and check if paused
    function _transfer(address sender, address recipient, uint256 amount) internal virtual override whenNotPaused {
        uint256 taxAmount = 0;
        TaxRates memory appliedRates;

        if (sender == address(this) || recipient == address(this)) {
            // No tax for contract interactions
        } else if (isBuying(sender)) {
            appliedRates = buyTaxRates;
            taxAmount = (amount * (appliedRates.liquidity + appliedRates.giveaway + appliedRates.marketing + appliedRates.treasury + appliedRates.buyback + appliedRates.burn)) / 10000;
        } else if (isSelling(recipient)) {
            appliedRates = sellTaxRates;
            taxAmount = (amount * (appliedRates.liquidity + appliedRates.giveaway + appliedRates.marketing + appliedRates.treasury + appliedRates.buyback + appliedRates.burn)) / 10000;
        } else {
            // Apply transfer tax for non-buy/sell transfers
            taxAmount = (amount * TRANSFER_TAX_RATE) / 10000;
        }

        if (taxAmount > 0) {
            // Distribute taxes to wallets
            uint256 liquidityTax = (taxAmount * appliedRates.liquidity) / 10000;
            uint256 giveawayTax = (taxAmount * appliedRates.giveaway) / 10000;
            uint256 marketingTax = (taxAmount * appliedRates.marketing) / 10000;
            uint256 treasuryTax = (taxAmount * appliedRates.treasury) / 10000;
            uint256 buybackTax = (taxAmount * appliedRates.buyback) / 10000;
            uint256 burnTax = (taxAmount * appliedRates.burn) / 10000;

            super._transfer(sender, liquidityWallet, liquidityTax);
            super._transfer(sender, giveawayWallet, giveawayTax);
            super._transfer(sender, marketingWallet, marketingTax);
            super._transfer(sender, treasuryWallet, treasuryTax);
            super._transfer(sender, buybackWallet, buybackTax);
            super._transfer(sender, burnAddress, burnTax);

            // Add liquidity tax to the Uniswap pair
            addLiquidity(liquidityTax);

            emit TransferTaxDistributed(liquidityTax, burnTax, treasuryTax);
        }

        // Transfer the remaining amount to the recipient
        super._transfer(sender, recipient, amount - taxAmount);

        // Distribute rewards to sender and recipient
        distributeRewards(sender);
        distributeRewards(recipient);
    }

    // Distribute rewards proportionally
    function distributeRewards(address user) internal {
        uint256 userBalance = balanceOf(user);
        uint256 totalSupply = totalSupply();

        if (userBalance > 0 && totalSupply > 0) {
            // Calculate reward amounts based on user's share of the total supply
            uint256 reward1 = (rewardToken1.balanceOf(address(this)) * userBalance) / totalSupply;
            uint256 reward2 = (rewardToken2.balanceOf(address(this)) * userBalance) / totalSupply;
            uint256 reward3 = (rewardToken3.balanceOf(address(this)) * userBalance) / totalSupply;

            // Apply reward token fees
            reward1 = applyRewardTokenFees(rewardToken1, reward1);
            reward2 = applyRewardTokenFees(rewardToken2, reward2);
            reward3 = applyRewardTokenFees(rewardToken3, reward3);

            // Transfer rewards to the user
            if (reward1 > 0) rewardToken1.transfer(user, reward1);
            if (reward2 > 0) rewardToken2.transfer(user, reward2);
            if (reward3 > 0) rewardToken3.transfer(user, reward3);

            emit RewardsDistributed(user, reward1, reward2, reward3);
        }
    }

    // Apply reward token fees
    function applyRewardTokenFees(IERC20 rewardToken, uint256 amount) internal view returns (uint256) {
        RewardTokenFees memory fees = rewardTokenFees[rewardToken];
        if (isBuying(msg.sender)) {
            return amount - (amount * fees.buyFee) / 10000;
        } else if (isSelling(msg.sender)) {
            return amount - (amount * fees.sellFee) / 10000;
        }
        return amount;
    }

    // Add liquidity to the Uniswap pair
    function addLiquidity(uint256 tokenAmount) internal {
        uint256 ethAmount = address(this).balance;
        if (tokenAmount > 0 && ethAmount > 0) {
            _approve(address(this), address(uniswapRouter), tokenAmount);

            // Add liquidity to the pair
            uniswapRouter.addLiquidityETH{value: ethAmount}(
                address(this),
                tokenAmount,
                0, // Slippage is unavoidable
                0, // Slippage is unavoidable
                liquidityWallet,
                block.timestamp
            );

            emit LiquidityAdded(tokenAmount, ethAmount);
        }
    }

    // Helper functions to detect buy/sell
    function isBuying(address sender) internal view returns (bool) {
        // Implement logic to detect buying (e.g., sender is a DEX pair)
        return sender == uniswapPair;
    }

    function isSelling(address recipient) internal view returns (bool) {
        // Implement logic to detect selling (e.g., recipient is a DEX pair)
        return recipient == uniswapPair;
    }

    // Allow the contract to receive ETH
    receive() external payable {}

    // Withdraw ETH stored in the contract
    function withdrawETH(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient ETH balance");
        payable(owner()).transfer(amount);
        emit ETHWithdrawn(owner(), amount);
    }

    // Claim rewards manually
    function claimRewards() external {
        distributeRewards(msg.sender);
        emit RewardsClaimed(msg.sender, rewards.reward1, rewards.reward2, rewards.reward3);
    }
}
```