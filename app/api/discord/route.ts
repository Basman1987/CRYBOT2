import { ethers } from "ethers"
import { NextResponse } from "next/server"

// Constants remain the same
const TOKEN_ADDRESS = "0xB770074eA2A8325440798fDF1c29B235b31922Ae"
const ROUTER_ADDRESS = "0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae"
const WCRO = "0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23"
const USDC = "0xc21223249CA28397B4B6541dfFaEcC539BfF0c59"

const ROUTER_ABI = ["function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)"]
const ERC20_ABI = ["function symbol() view returns (string)", "function decimals() view returns (uint8)"]

export const dynamic = "force-dynamic"

// Updated function to handle BigInt safely and preserve decimals
function formatExactPrice(rawAmount, decimals) {
  const amountStr = rawAmount.toString().padStart(Number(decimals) + 1, "0")
  const integerPart = amountStr.slice(0, -Number(decimals)) || "0"
  const decimalPart = amountStr.slice(-Number(decimals)).padEnd(9, "0").slice(0, 9)
  return `${integerPart}.${decimalPart}`
}

export async function GET() {
  if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CHANNEL_ID) {
    return NextResponse.json({ error: "Missing environment variables" }, { status: 500 })
  }

  try {
    const provider = new ethers.JsonRpcProvider("https://evm.cronos.org/")
    const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider)
    const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider)
    const usdc = new ethers.Contract(USDC, ERC20_ABI, provider)

    // Fetch token and USDC decimals
    const [symbol, tokenDecimals, usdcDecimals] = await Promise.all([token.symbol(), token.decimals(), usdc.decimals()])

    const amountIn = ethers.parseUnits("1", tokenDecimals)

    // Check both paths to get the most accurate price
    const [forwardAmounts, reverseAmounts, croAmounts] = await Promise.all([
      router.getAmountsOut(amountIn, [TOKEN_ADDRESS, WCRO, USDC]),
      router.getAmountsOut(ethers.parseUnits("1", usdcDecimals), [USDC, WCRO, TOKEN_ADDRESS]),
      router.getAmountsOut(amountIn, [TOKEN_ADDRESS, WCRO]), // Direct TOKEN to CRO price
    ])

    // Calculate USD prices from both paths
    const priceForward = formatExactPrice(forwardAmounts[2], usdcDecimals)
    const priceReverse = formatExactPrice(
      (BigInt(1e18) * BigInt(1)) / reverseAmounts[2], // Invert to get TOKEN price in USDC
      usdcDecimals,
    )

    // Calculate CRO price
    const croPrice = formatExactPrice(croAmounts[1], 18) // WCRO uses 18 decimals

    // Compare both USD prices and take the most accurate one
    const formattedPrice = Number(priceForward) > 0 ? priceForward : priceReverse

    // Prepare Discord message with both USD and CRO prices
    const message = {
      content: `
📊 **${symbol} Price Update**
💵 USD Price: $${formattedPrice}
🪙 CRO Price: ${croPrice} CRO
⏰ Updated: ${new Date().toLocaleString()}
🔗 Contract: \`${TOKEN_ADDRESS}\`
      `,
    }

    const response = await fetch(`https://discord.com/api/v10/channels/${process.env.DISCORD_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    })

    if (!response.ok) {
      const errorData = await response.text()
      console.error("Discord API Response:", errorData)
      throw new Error(`Discord API error: ${response.status} ${response.statusText} - ${errorData}`)
    }

    return NextResponse.json({
      success: true,
      message: "Price update sent successfully",
      price: formattedPrice,
      croPrice: croPrice,
    })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

